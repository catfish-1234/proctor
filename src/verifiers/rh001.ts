import { basename } from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';

// Modifier forms (it.each, test.skip, describe.only, ...) are deletions of tests too — keep
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

function extractTestName(content: string): string {
  const m = content.match(/['"](.*?)['"]/);
  return m?.[1] ?? 'unknown';
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
      for (const change of chunk.changes) {
        if (change.type !== 'del') continue;
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
