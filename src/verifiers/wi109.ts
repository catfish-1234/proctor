import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, deletedLines, pathOf, withoutTrailingComment } from './wi-common.js';

/**
 * The expected value edited to match what the code actually does.
 *
 * This is the most direct test cheat there is, and until adversarial probing turned it up, proctor
 * did not catch it. RH002 watches an assertion getting *weaker* (`toBe(3)` becoming
 * `toBeDefined()`). It says nothing about an assertion that stays exactly as strict and simply
 * expects the wrong answer. `toBe(3)` becoming `toBe(4)` is not a weaker test, it is a test of a
 * different, incorrect claim, and the suite goes green because the claim now matches the bug.
 *
 * The signal is the pairing with what else the change touched. Updating an expectation is completely
 * routine when the behaviour it describes deliberately changed: you edit the code and the test
 * together. What is not routine is editing only the expectation. So this fires when a test's
 * expected literal changes and the change touches no non-test source at all, which is the shape of
 * "the test was wrong" when what actually happened is "the code was wrong".
 */

/**
 * Assertions carrying a literal expected value, across the frameworks proctor already covers
 * elsewhere. The captured group is the expected value itself.
 */
const EXPECTED_VALUE_PATTERNS: RegExp[] = [
  // JS/TS: expect(actual).toBe(3) / toEqual / toStrictEqual / toBeCloseTo / toHaveLength
  /\.(?:toBe|toEqual|toStrictEqual|toBeCloseTo|toHaveLength|toHaveBeenCalledTimes)\(\s*([^)]+?)\s*\)/,
  // Python: assert x == 3
  /\bassert\s+[^=<>!\n]+==\s*([^\s,)#]+)/,
  // pytest.approx and unittest
  /\bassertEqual\s*\([^,]+,\s*([^)]+?)\s*\)/,
  // Go testify, Java/Kotlin JUnit, C#/VB, PHP: assertEquals(expected, actual)
  /\bassert(?:\.Equal|Equals|Equal)\s*\(\s*(?:t\s*,\s*)?([^,]+?)\s*,/,
  // Rust
  /\bassert_eq!\s*\(\s*[^,]+,\s*([^)]+?)\s*\)/,
  // RSpec
  /\bto\s+eq\(\s*([^)]+?)\s*\)/,
];

/** A literal: a number, a quoted string, or a boolean. Not an expression or an identifier. */
const LITERAL_RE = /^(?:-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|true|false|True|False|null|None|nil)$/;

/** Non-test source files, whose presence in the diff means the behaviour genuinely moved. */
function touchesImplementation(context: Context, files: { path: string }[]): boolean {
  return files.some(f => {
    if (context.isTestFile(f.path)) return false;
    // Config, docs, lockfiles and fixtures are not the behaviour under test.
    return !/\.(?:md|json|ya?ml|toml|lock|txt|snap)$/i.test(f.path) &&
      !/(?:^|\/)(?:fixtures?|testdata|__snapshots__)\//.test(f.path.replace(/\\/g, '/'));
  });
}

/** The expected literal on a line, or undefined when there isn't a plain one. */
function expectedLiteral(text: string): string | undefined {
  const stripped = withoutTrailingComment(text);
  for (const re of EXPECTED_VALUE_PATTERNS) {
    const m = re.exec(stripped);
    if (!m) continue;
    const value = m[1]!.trim();
    if (LITERAL_RE.test(value)) return value;
  }
  return undefined;
}

/**
 * Normalizes an assertion so the same assertion with a different expected value pairs with itself.
 *
 * Everything except the literal is kept, so `expect(add(1, 2)).toBe(3)` and
 * `expect(add(1, 2)).toBe(4)` collapse to the same key while an assertion about something else
 * entirely does not.
 */
function assertionKey(text: string): string {
  return withoutTrailingComment(text)
    .replace(/-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|\btrue\b|\bfalse\b|\bTrue\b|\bFalse\b/g, '@')
    .replace(/\s+/g, '')
    .trim();
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  const changedPaths = context.files.map(f => ({ path: pathOf(f) })).filter(f => f.path);
  // The behaviour genuinely changed somewhere, so updating expectations alongside it is ordinary
  // work. This check is only about a change that edits expectations and nothing else.
  if (touchesImplementation(context, changedPaths)) return findings;

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath || !context.isTestFile(filePath)) continue;

    for (const chunk of file.chunks) {
      const removed = deletedLines(chunk)
        .map(l => ({ line: l, value: expectedLiteral(l.text), key: assertionKey(l.text) }))
        .filter(x => x.value !== undefined);
      if (removed.length === 0) continue;

      for (const added of addedLines(chunk)) {
        const value = expectedLiteral(added.text);
        if (value === undefined) continue;
        const key = assertionKey(added.text);
        // The same assertion, still asserting a plain literal, now asserting a different one.
        const prior = removed.find(r => r.key === key && r.value !== value);
        if (!prior) continue;

        findings.push({
          verifierId: 'WI109',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: `Expected value changed from ${prior.value} to ${value} with no change to the code under test, so the test now describes the current behaviour rather than the correct one.`,
          suggestion:
            'Change the code, not the expectation. If the old expected value was genuinely wrong, that is a claim about the specification, so say what changed and why rather than editing the number until the suite agrees with the bug.',
        });
      }
    }
  }

  return findings;
}

export const wi109: Verifier = { id: 'WI109', severity: 'error', run };
