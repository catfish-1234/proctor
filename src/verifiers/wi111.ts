import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, afterLines, deletedLines, pathOf } from './wi-common.js';

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

/**
 * Build and tooling configuration, which is not the thing under test.
 *
 * Deleting `babel.config.js` during a bundler migration is not deleting the code a failing test
 * covers; it is changing how that code is built. A real commit in the sweep did exactly that and
 * was told it had removed an implementation while its tests remained.
 */
const CONFIG_FILE_RE =
  /(?:^|\/)(?:[\w.-]+\.config\.(?:[cm]?[jt]s)|\.?babelrc(?:\.[cm]?js)?|karma\.conf\.js|gulpfile\.[cm]?js|gruntfile\.[cm]?js|conftest\.py|setup\.py|noxfile\.py)$/i;

/**
 * Type-level test files, which every `*.test.ts` glob misses by one character.
 *
 * tsd and its imitators name them `*.test-d.ts`, so proctor's default test globs do not claim them
 * and this check read a deleted one as a deleted implementation.
 */
const TYPE_TEST_RE = /\.test-d\.[cm]?tsx?$/i;

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
      if (CONFIG_FILE_RE.test(normalized) || TYPE_TEST_RE.test(normalized)) continue;
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
    // "Asserts nothing" has to be true of the file, not just of the hunks. Counting only what the
    // diff touches said a file with forty tests asserts nothing when two of them were removed,
    // which is both wrong and the loudest thing this check said in a sweep of real commits. A test
    // declaration on an unchanged context line is direct evidence that tests survive. It is
    // evidence the diff may not carry, so this narrows the claim without inventing one: no
    // surviving declaration in view means the check can still fire, as it must for a file whose
    // every test really was removed in one hunk.
    const survivingDeclarations = file.chunks
      .flatMap(afterLines)
      .filter(l => !l.added && TEST_DECLARATION_RE.test(l.text)).length;
    if (survivingDeclarations > 0) continue;

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
