import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, deletedLines, pathOf } from './wi-common.js';

/**
 * The thing under test removed, rather than made to work.
 *
 * Two shapes, both found by adversarial probing and both previously invisible.
 *
 * An implementation file deleted outright is the bluntest possible "fix": the failing code is gone,
 * so nothing fails. RH001 covers the mirror image, a deleted *test*, and said nothing about this
 * direction. A feature that genuinely goes away takes its tests with it, which is exactly what the
 * gate below looks for.
 *
 * A test file that survives with its tests removed is the same move at a smaller scale: the file is
 * still there, still counted, still imported, and asserts nothing. RH001 matches deleted test
 * functions against added ones, so a wholesale rewrite that leaves an empty `describe` shell can
 * slip between its cases.
 */

/**
 * Individual test cases, deliberately excluding suite wrappers.
 *
 * `describe` and `context` group tests; they assert nothing themselves. Counting them meant an
 * emptied file still looked populated, because gutting every `it` while leaving
 * `describe('add', () => {})` behind reads as one declaration removed and one added. The suite
 * shell surviving is exactly the shape this is meant to catch, so only real cases count.
 */
const TEST_DECLARATION_RE =
  /\b(?:it|test|specify)\s*(?:\.\w+)?\s*\(|\bdef\s+test_\w+|\bfunc\s+Test\w+|@Test\b|\[Fact\]|\[Test\]|\bit\s+['"]|#\[test\]|\bTEST(?:_F)?\s*\(/;

/** Source extensions worth treating as program logic when the whole file disappears. */
const SOURCE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|rb|php|cs|kt|rs|swift|dart|scala|ex|exs)$/i;

/** Trees whose contents are not somebody's implementation. */
const NOT_IMPLEMENTATION_RE =
  /(?:^|\/)(?:node_modules|dist|build|out|target|coverage|vendor|third_party|\.venv|__pycache__|fixtures?|testdata|examples?|docs?|scripts?)\//i;

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  const paths = context.files.map(f => pathOf(f)).filter(Boolean);
  const testPathsInDiff = paths.filter(p => context.isTestFile(p));

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath) continue;
    const normalized = filePath.replace(/\\/g, '/');
    const deleted = (file as { deleted?: boolean }).deleted === true;

    // Shape one: an implementation file deleted while its tests stay behind.
    if (deleted && !context.isTestFile(filePath)) {
      if (!SOURCE_EXT_RE.test(normalized) || NOT_IMPLEMENTATION_RE.test(normalized)) continue;
      // A feature genuinely being removed takes its tests with it. If any test file is also being
      // deleted in this change, this reads as a removal rather than an evasion, and RH001 is the
      // check that has an opinion about the test side of that.
      const testsAlsoDeleted = context.files.some(f => {
        const p = pathOf(f);
        return p && context.isTestFile(p) && (f as { deleted?: boolean }).deleted === true;
      });
      if (testsAlsoDeleted) continue;
      // A pure rename shows up as a delete plus an add of the same basename elsewhere.
      const base = path.basename(normalized);
      const movedElsewhere = context.files.some(f => {
        const p = pathOf(f);
        return p !== filePath && path.basename(p.replace(/\\/g, '/')) === base && (f as { new?: boolean }).new === true;
      });
      if (movedElsewhere) continue;

      findings.push({
        verifierId: 'WI111',
        severity: 'error',
        file: filePath,
        line: 1,
        message: `Implementation deleted: ${base} was removed while its tests remain, so nothing fails because there is nothing left to run.`,
        suggestion:
          'Restore the file and make it work. Deleting the code under test is the same evasion as deleting the test, one layer down. If the feature really is being removed, remove its tests in the same change and say so.',
      });
      continue;
    }

    // Shape two: a test file that survives with every test declaration gone.
    if (!context.isTestFile(filePath) || deleted) continue;
    const removedDeclarations = file.chunks
      .flatMap(deletedLines)
      .filter(l => TEST_DECLARATION_RE.test(l.text)).length;
    if (removedDeclarations === 0) continue;
    const addedDeclarations = file.chunks
      .flatMap(addedLines)
      .filter(l => TEST_DECLARATION_RE.test(l.text)).length;
    // Only when the file ends up with strictly fewer tests than it had, and specifically when the
    // change removes them all: a refactor that consolidates ten cases into eight is not this.
    if (addedDeclarations > 0) continue;

    findings.push({
      verifierId: 'WI111',
      severity: 'error',
      file: filePath,
      line: 1,
      message: `Tests emptied: ${removedDeclarations} test declaration${removedDeclarations === 1 ? '' : 's'} removed from ${path.basename(normalized)} with none added, leaving a test file that asserts nothing.`,
      suggestion:
        'Put the tests back and make the code satisfy them. A test file with no tests in it still counts as a passing file to every runner and every report, which is worse than deleting it outright.',
    });
  }

  return findings;
}

export const wi111: Verifier = { id: 'WI111', severity: 'error', run };
