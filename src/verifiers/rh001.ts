import { basename } from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';
import { closingDelimiter, sourceView } from './structure.js';
import { MAX_LINE_LENGTH, type ParsedFile } from '../diff.js';
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

/** Complete C# test files may move with only their namespace name changed. */
function csharpMoveIdentity(file: ParsedFile, kind: 'del' | 'add'): string | undefined {
  const path = kind === 'del' ? file.from : file.to;
  if (!path?.endsWith('.cs') || !(kind === 'del' ? file.deleted : file.new)) return;
  if (file.chunks.length !== 1) return;
  const chunk = file.chunks[0]!;
  const start = kind === 'del' ? chunk.oldStart : chunk.newStart;
  const count = kind === 'del' ? chunk.oldLines : chunk.newLines;
  if (start !== 1 || count !== chunk.changes.length
    || chunk.changes.some(c => c.type !== kind || c.content.length >= MAX_LINE_LENGTH)) return;
  const view = sourceView(chunk, kind === 'del' ? 'before' : 'after');
  const namespace = /\bnamespace\s+([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*(?=[{;])/.exec(view.code);
  if (!namespace || !/^(?:\s*using\b[^;{}]*;)*\s*$/.test(view.code.slice(0, namespace.index))
    || !/\[(?:Test|TestMethod|Fact|Theory)\s*(?:\(|\])/.test(view.code)
    || !/\bAssert\s*\./.test(view.code)) return;
  // Preserve declarations, assertions, literals, helpers and attributes verbatim.
  // Titles and assertion counts cannot prove that a replacement exercises the same behavior.
  const nameStart = namespace.index + namespace[0].lastIndexOf(namespace[1]!);
  return `${basename(path)}\0${view.text.slice(0, nameStart)}${view.text.slice(nameStart + namespace[1]!.length)}`;
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
 * C# instead requires complete file identity apart from the namespace name, and each newly added
 * file can cover only one deletion. Other files without recognizable test titles never qualify.
 */
function testsRelocated(file: ParsedFile, files: ParsedFile[], ctx: Context, claimed: Set<ParsedFile>): boolean {
  if (file.from?.endsWith('.cs')) {
    const identity = csharpMoveIdentity(file, 'del');
    if (!identity) return false;
    const replacement = files.find(other => other !== file && !claimed.has(other)
      && ctx.isTestFile(other.to ?? '') && csharpMoveIdentity(other, 'add') === identity);
    if (!replacement) return false;
    claimed.add(replacement);
    return true;
  }
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

/** A test of a removed symbol in the corresponding source unit can go with that feature. */
function removedFeature(context: Context, testPath: string, testCode: string): boolean {
  const unit = (path: string) => (path.split('/').pop() ?? '').replace(/\.(?:test|spec)\.[^.]+$|\.[^.]+$/,'')
    .replace(/^test_/, '').replace(/_test$/,'').replace(/^_+/,'');
  const declaration = /\b(?:function|def|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const candidate of context.files) {
    const path = candidate.from ?? candidate.to ?? '';
    if (context.isTestFile(path) || unit(path) !== unit(testPath)) continue;
    const before = candidate.chunks.map(chunk=>sourceView(chunk,'before',path.endsWith('.py')));
    const after = candidate.chunks.map(chunk=>sourceView(chunk,'after',path.endsWith('.py')));
    for (const view of before) for (const match of view.code.matchAll(declaration)) {
      const name = match[1]!;
      if (!view.touched(match.index!,match.index! + match[0].length)) continue;
      if (after.some(next=>[...next.code.matchAll(/\b(?:function|def|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].some(declaration=>declaration[1]===name))) continue;
      for (const reference of testCode.matchAll(/[A-Za-z_$][\w$]*/g)) {
        if (reference[0] !== name) continue;
        let next = reference.index! + reference[0].length;
        while (/\s/.test(testCode[next] ?? '') && next < testCode.length) next++;
        if (testCode[reference.index! - 1] === '.' || testCode[next] === '(') return true;
      }
    }
  }
  return false;
}

const ASSERTIONS_G = new RegExp(ASSERTION_RE.source, 'g');
const countAssertions = (code: string): number => [...code.matchAll(ASSERTIONS_G)].length;

/** The body of the test declared at `start` in `code`: by indentation in Python, else its call parens. */
function testBody(code: string, start: number, python: boolean, declaration: string): string {
  let end = code.length;
  if (python) {
    const indent = /^\s*/.exec(declaration.slice(1))![0].length;
    const nextLine = code.indexOf('\n', start);
    const rest = code.slice(nextLine + 1);
    for (const match of rest.matchAll(/^( *)(\S)/gm)) if (match[1]!.length <= indent) { end = nextLine + 1 + match.index!; break; }
  } else {
    const open = code.indexOf('(', start);
    if (open >= 0) { const close = closingDelimiter(code, open, '(', ')'); if (close >= 0) end = close + 1; }
  }
  return code.slice(start, end);
}

/**
 * Tests this diff adds to each test file, by title, with how many assertions each body carries.
 * A test deleted from one file and added under the same title in another moved; it was not
 * dropped. Found on real commits ("move utility functions and their tests"), where the move was
 * reported as five deletions.
 */
function addedTestsByTitle(files: ParsedFile[], ctx: Context): Map<string, Array<{ file: ParsedFile; assertions: number }>> {
  const added = new Map<string, Array<{ file: ParsedFile; assertions: number }>>();
  for (const file of files) {
    const to = file.to ?? '';
    if (!to || file.deleted || !ctx.isTestFile(to)) continue;
    const python = to.endsWith('.py');
    for (const chunk of file.chunks) {
      const after = sourceView(chunk, 'after', python);
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        const js = JS_TS_ADD.test(change.content);
        if (!js && !PY_ADD.test(change.content)) continue;
        const title = js ? extractTestName(change.content)
          : change.content.replace(/^\+\s*(?:async\s+)?def /, '').replace(/\s*\(.*/, '');
        const start = after.offsetAtLine(change.ln);
        const assertions = start === undefined ? 0 : countAssertions(testBody(after.code, start, python, change.content));
        added.set(title, [...(added.get(title) ?? []), { file, assertions }]);
      }
    }
  }
  return added;
}

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];
  const claimedMoves = new Set<ParsedFile>();
  // Built on first use: most diffs delete no test, and those never pay for the scan.
  let addedCache: ReturnType<typeof addedTestsByTitle> | undefined;
  const addedTests = (): ReturnType<typeof addedTestsByTitle> => (addedCache ??= addedTestsByTitle(files, ctx));

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
      if (testsRelocated(file, files, ctx, claimedMoves)) continue;
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
      // A test declaration inside a multi-line template is a payload, not a test: a codemod, a
      // linter or a migration guide embeds test source as data, and those files are themselves
      // test files, so the isTestFile gate above does not exclude them. Same rule the WI family
      // learned five times over, reaching RH001 last.
      const templateLines = insideTemplateLiteral(
        chunk.changes.map(c => ({ text: c.content.replace(/^[+-]/, ''), line: 0, added: c.type === 'add' })),
      );
      // Pair each added declaration with a deleted one of the same title first: that is the same
      // test edited in place (a weakened assertion, a reformat, a `.skip` wrap), and it says
      // nothing about any other test in the chunk. Only additions left over after that can stand
      // for a renamed test or a consolidation into one parameterized test. Before this pairing,
      // any added declaration excused every deletion in its chunk, so editing one test in place
      // hid the deletion of the test next to it.
      const pending = new Map<string, number>();
      let unpairedAdds = 0;
      const declTitle = (content: string): string | undefined =>
        JS_TS_ADD.test(content) || JS_TS_DEL.test(content) ? extractTestName(content)
          : PY_ADD.test(content) || PY_DEL.test(content) ? content.replace(/^[+-]\s*(?:async\s+)?def /, '').replace(/\s*\(.*/, '')
            : undefined;
      const deletedTitles = new Map<string, number>();
      for (const [index, change] of chunk.changes.entries()) {
        if (change.type !== 'del' || templateLines.has(index)) continue;
        const title = declTitle(change.content);
        if (title !== undefined) deletedTitles.set(title, (deletedTitles.get(title) ?? 0) + 1);
      }
      for (const [index, change] of chunk.changes.entries()) {
        if (change.type !== 'add' || templateLines.has(index)) continue;
        if (!JS_TS_ADD.test(change.content) && !PY_ADD.test(change.content)) continue;
        const title = declTitle(change.content)!;
        const available = (deletedTitles.get(title) ?? 0) - (pending.get(title) ?? 0);
        if (available > 0) pending.set(title, (pending.get(title) ?? 0) + 1);
        else unpairedAdds++;
      }
      for (const [changeIndex, change] of chunk.changes.entries()) {
        if (change.type !== 'del') continue;
        if (templateLines.has(changeIndex)) continue;
        const title = declTitle(change.content);
        if (title !== undefined && (pending.get(title) ?? 0) > 0) {
          pending.set(title, pending.get(title)! - 1);
          continue; // the same test, edited in place
        }
        if (unpairedAdds > 0) continue; // renamed, reformatted, or consolidated into a new declaration
        const before = sourceView(chunk,'before',from.endsWith('.py'));
        const start = before.offsetAtLine(change.ln);
        if (start !== undefined) {
          const body = testBody(before.code, start, from.endsWith('.py'), change.content);
          if (removedFeature(ctx,from,body)) continue;
          // The same test added to another test file, still checking at least as much, moved.
          const moved = title === undefined ? undefined : addedTests().get(title)
            ?.find(entry => entry.file !== file && entry.assertions >= countAssertions(body));
          if (moved) continue;
        }
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
