import { basename } from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';
import type { ParsedFile } from '../diff.js';
import { insideTemplateLiteral } from './wi-common.js';

// Modifier forms (it.each, test.skip, describe.only, ...) are deletions of tests too, keep
// this in sync with JS_TS_ADD below so both sides of the pairing see the same shapes.
const JS_TS_DEL = /^-\s*(?:it|test|describe)(?:\.\w+)?\s*\(/;
const PY_DEL = /^-\s*(?:async\s+)?def test_/;

// A deleted test-declaration line only counts as a real deletion if nothing plausibly
// representing the same test was added in the same chunk. Matches any modifier (.skip/.only/
// .each/...) so a rename, reformat, `.skip()` wrap, or `.each()` consolidation pairs against its
// replacement instead of being reported as a deletion. This is deliberately loose (it just checks
// whether something was added to the same chunk, not a strict title match), so a
// many-tests-collapsed-into-one-parameterized-test consolidation is recognized too. A stricter
// title-equality check couldn't catch that case.
const JS_TS_ADD = /^\+\s*(?:it|test|describe)(?:\.\w+)?\s*\(/;
const PY_ADD = /^\+\s*(?:async\s+)?def test_/;

/**
 * The title a test declaration was given.
 *
 * The closing quote has to be the same character as the opening one. Without the backreference,
 * `test('Cannot set "stdout" option to "ipc"', ...)` stopped at the first inner double quote and
 * yielded the title `Cannot set `, which is both what the finding printed and, worse, the key this
 * title is paired against: five distinct execa tests collapsed onto one truncated key, so a deleted
 * test could be matched against an unrelated added one that happened to share a prefix. Found in a
 * sweep of real commits, where the truncation was visible in the message.
 */
function extractTestName(content: string): string {
  const m = content.match(/(['"`])(.*?)\1/);
  return m?.[2] ?? 'unknown';
}

// A whole test file being deleted is only suspicious if its implementation isn't also being
// deleted in the same diff. A test file deleted alongside its own implementation file is a
// coordinated, legitimate feature removal. The pattern this check exists to catch is a test file
// deleted alone while the code it tested stays behind.
function implBaseName(p: string): string {
  const file = p.split('/').pop() ?? p;
  return file
    .replace(/\.(test|spec)\.[jt]sx?$/, '')
    .replace(/\.[jt]sx?$/, '')
    .replace(/\.py$/, '')
    .replace(/^test_/, '')
    .replace(/_test$/, '');
}

// Coordination matching is basename-only (so a test and its impl can live in different dirs), but
// generic names collide across unrelated files. An agent could hide a failing `foo/index.test.ts`
// deletion by also deleting any throwaway `bar/index.ts`. For these ambiguous names, require the
// co-deleted impl to sit in the SAME directory as the test before treating it as coordinated;
// distinctive names (userService, legacyExport) still match across directories.
const GENERIC_STEMS = new Set([
  'index', 'main', 'app', 'config', 'utils', 'types', 'helpers', 'constants',
  'common', 'base', 'core', 'setup', 'init', 'mod', 'lib',
]);
const dirOf = (p: string): string => { const i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i); };

// Test titles, for matching a deleted test against the same test reappearing elsewhere. Covers
// the `it('name')` / `def test_name` declaration forms RH001 already recognizes.
function testTitlesIn(file: ParsedFile, kind: 'del' | 'add'): Set<string> {
  const titles = new Set<string>();
  const declRe = kind === 'del' ? JS_TS_DEL : JS_TS_ADD;
  const pyRe = kind === 'del' ? PY_DEL : PY_ADD;
  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if (change.type !== kind) continue;
      if (declRe.test(change.content)) {
        titles.add(extractTestName(change.content));
      } else if (pyRe.test(change.content)) {
        titles.add(change.content.replace(/^[+-]\s*(?:async\s+)?def /, '').replace(/\s*\(.*/, ''));
      }
    }
  }
  return titles;
}

// Assertion shapes strong enough to count as a test still doing its job. Matching a title alone
// is not enough to prove a test moved, since an empty-bodied clone can reproduce any title.
const ASSERTION_RE = /\bexpect\s*\(|\bassert\b|\bassertEqual\(|\bassertRaises\(|\.should\b|\bshouldBe\b/;

function assertionCount(file: ParsedFile, kind: 'del' | 'add'): number {
  let n = 0;
  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if (change.type === kind && ASSERTION_RE.test(change.content)) n++;
    }
  }
  return n;
}

/**
 * True when the tests being removed from `file` show up in another test file in the same diff.
 *
 * Two conditions, and both matter. Every removed test title has to reappear, which distinguishes a
 * move or a split from "deleted the auth tests, added an unrelated one somewhere else". And the
 * receiving files have to pick up at least as many assertions as the deleted file gave up, which
 * is what stops the obvious dodge: cloning the titles into empty test bodies so the names line up
 * while the checks themselves quietly disappear.
 *
 * A file whose deletion removes no recognizable test titles at all (an unparsed language, a
 * fixture-only file) never qualifies, so the plain deletion case still fires.
 */
function testsRelocated(file: ParsedFile, files: ParsedFile[], ctx: Context): boolean {
  const removed = testTitlesIn(file, 'del');
  if (removed.size === 0) return false;

  const relocated = new Set<string>();
  let assertionsGained = 0;
  for (const other of files) {
    if (other === file) continue;
    if (!ctx.isTestFile(other.to ?? other.from ?? '')) continue;
    for (const title of testTitlesIn(other, 'add')) {
      if (removed.has(title)) relocated.add(title);
    }
    assertionsGained += assertionCount(other, 'add');
  }
  if (relocated.size !== removed.size) return false;
  return assertionsGained >= assertionCount(file, 'del');
}

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const from = file.from ?? '';
    const to = file.to ?? '';

    // Path 1: whole file deleted
    if (file.deleted && ctx.isTestFile(from)) {
      const target = implBaseName(from);
      const targetIsGeneric = GENERIC_STEMS.has(target.toLowerCase());
      // A co-deleted non-test file counts as the coordinated impl removal when its stem matches.
      // For a generic stem (index/utils/...), additionally require the same directory, so a
      // matching generic name in an unrelated dir can't be used to mask a test deletion.
      const isCoordinatedImpl = (other: (typeof files)[number]): boolean => {
        const otherFrom = other.from ?? '';
        return other !== file
          && other.deleted === true
          && !ctx.isTestFile(otherFrom)
          && implBaseName(otherFrom) === target
          && (!targetIsGeneric || dirOf(otherFrom) === dirOf(from));
      };
      const hasCoordinatedImplDeletion = files.some(isCoordinatedImpl);
      if (hasCoordinatedImplDeletion) continue; // coordinated removal, not a hidden test deletion
      // Moving or splitting a test file shows up as delete-here plus add-there whenever git
      // doesn't score it as a rename (a move with edits usually doesn't). If the same test names
      // land in another test file in this same diff, the tests weren't dropped, they relocated.
      if (testsRelocated(file, files, ctx)) continue;
      findings.push({
        verifierId: 'RH001',
        severity: 'error',
        file: from,
        line: 1,
        message: `Test file '${basename(from)}' was deleted.`,
        suggestion: 'Restore the deleted test file or document why it was intentionally removed.',
      });
      continue;
    }

    // Path 3: rename drops test extension
    if (ctx.isTestFile(from) && !ctx.isTestFile(to) && to !== '' && to !== undefined) {
      findings.push({
        verifierId: 'RH001',
        severity: 'error',
        file: from,
        line: 1,
        message: `Test file '${basename(from)}' was renamed to '${basename(to)}', dropping the test extension.`,
        suggestion: 'Restore the deleted test or document why it was intentionally removed.',
      });
      continue;
    }

    // Path 2: individual test function deleted inside a test file
    if (!ctx.isTestFile(from)) continue;

    for (const chunk of file.chunks) {
      const hasReconcilingAdd = chunk.changes.some(
        c => c.type === 'add' && (JS_TS_ADD.test(c.content) || PY_ADD.test(c.content)),
      );
      // A test declaration inside a multi-line template is a payload, not a test: a codemod, a
      // linter or a migration guide embeds test source as data, and those files are themselves
      // test files, so the isTestFile gate above does not exclude them. Same rule the WI family
      // learned five times over, reaching RH001 last.
      const templateLines = insideTemplateLiteral(
        chunk.changes.map(c => ({ text: c.content.replace(/^[+-]/, ''), line: 0, added: c.type === 'add' })),
      );
      for (const [changeIndex, change] of chunk.changes.entries()) {
        if (change.type !== 'del') continue;
        if (templateLines.has(changeIndex)) continue;
        if (hasReconcilingAdd) continue; // modified (renamed/reformatted/skip-wrapped/consolidated), not deleted
        if (JS_TS_DEL.test(change.content)) {
          const name = extractTestName(change.content);
          findings.push({
            verifierId: 'RH001',
            severity: 'error',
            file: from,
            line: change.ln,
            message: `Test function '${name}' was deleted in this change.`,
            suggestion: 'Restore the deleted test or document why it was intentionally removed.',
          });
        } else if (PY_DEL.test(change.content)) {
          const name = change.content.replace(/^-\s*(?:async\s+)?def /, '').replace(/\s*\(.*/, '');
          findings.push({
            verifierId: 'RH001',
            severity: 'error',
            file: from,
            line: change.ln,
            message: `Test function '${name}' was deleted in this change.`,
            suggestion: 'Restore the deleted test or document why it was intentionally removed.',
          });
        }
      }
    }
  }

  return findings;
}

export const rh001: Verifier = { id: 'RH001', severity: 'error', run };
