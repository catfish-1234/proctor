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
const EXPECTED_BINDING_RE =
  /^\s*(?:(?:const|let|var)\s+)?(expected|want)\s*(?::=|=)\s*(-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|true|false|True|False|null|None|nil)\s*;?\s*$/i;

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

function expectedBinding(text: string): { name: string; value: string } | undefined {
  const match = EXPECTED_BINDING_RE.exec(withoutTrailingComment(text));
  return match ? { name: match[1]!.toLowerCase(), value: match[2]! } : undefined;
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

/**
 * The same edit, one level of indirection away.
 *
 * The pass above pairs an assertion line against itself, which is why it sees nothing when the
 * expected value does not live on the assertion. A parametrised suite puts it in a table
 * (`const cases = [[1, 2, 3], ...]`) and the assertion reads a variable, so the line that changes
 * carries no assertion at all and the line that asserts never changes. Adversarial probing found
 * this immediately, and it is the cheaper cheat of the two: editing one number inside an array
 * reads as fixture maintenance.
 *
 * The runner marker below is what keeps this from firing on ordinary data. A changed literal in a
 * test file is not a signal on its own, plenty of tests carry constants that legitimately move.
 * A changed literal in a table that a parametrised runner iterates is one, because that table
 * holds the suite's expectations. Requiring the marker in the same file's diff means a table
 * whose runner sits far from the edit is missed rather than guessed at, which is the trade this
 * corpus has priced twice: one false positive on somebody's real work costs more than several
 * misses.
 */
const TABLE_RUNNER_RE =
  /\.each\b|\bit_each\b|@pytest\.mark\.parametrize|@ParameterizedTest\b|\[InlineData\b|\[Theory\]|\bfor\s+(?:const|let|var)?\s*[\w[\],{} ]+\s+(?:of|in)\s+\w*(?:case|test|table|fixture|sample|scenario|example)\w*\b|\bfor\s+\w+,\s*\w+\s*:=\s*range\b|\.forEach\s*\(|\btests\s*:?=\s*\[\]struct\b/i;

/** True when a line is table data rather than executable test logic: literals inside a collection. */
function isDataRow(text: string): boolean {
  const stripped = withoutTrailingComment(text);
  if (!/[[{]/.test(stripped)) return false;
  const literals = stripped.match(/-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|\btrue\b|\bfalse\b|\bTrue\b|\bFalse\b/g);
  return (literals?.length ?? 0) >= 2;
}

/** The literals on a line, in order, so a changed one can be named in the finding. */
function literalsOf(text: string): string[] {
  return withoutTrailingComment(text).match(/-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|\btrue\b|\bfalse\b|\bTrue\b|\bFalse\b/g) ?? [];
}

interface ChangedTableValue {
  before: string;
  after: string;
}

/**
 * A conservative table-row comparison: inputs stay byte-for-byte equal and only the final column
 * changes. Parametrised tests conventionally put the expected value last. If an input changes, or
 * several columns move, the edit is ordinary test-case maintenance and this check stays silent.
 */
function changedTableExpectation(before: string, after: string): ChangedTableValue | undefined {
  const rows = (text: string): string[][] => {
    const stripped = withoutTrailingComment(text);
    const nested = [...stripped.matchAll(/\[([^\[\]]+)\]|\{([^{}]+)\}/g)]
      .map(m => literalsOf(m[1] ?? m[2] ?? ''))
      .filter(values => values.length >= 2);
    return nested.length > 0 ? nested : isDataRow(stripped) ? [literalsOf(stripped)] : [];
  };

  const oldRows = rows(before);
  const newRows = rows(after);
  if (oldRows.length === 0 || oldRows.length !== newRows.length) return undefined;

  let changed: ChangedTableValue | undefined;
  for (let i = 0; i < oldRows.length; i++) {
    const oldValues = oldRows[i]!;
    const newValues = newRows[i]!;
    if (oldValues.length !== newValues.length) return undefined;
    const last = oldValues.length - 1;
    const inputsMatch = oldValues.slice(0, last).every((value, index) => value === newValues[index]);
    if (!inputsMatch) return undefined;
    if (oldValues[last] === newValues[last]) continue;
    if (changed) return undefined; // several expectations changed at once: too broad to infer intent
    changed = { before: oldValues[last]!, after: newValues[last]! };
  }
  return changed;
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
    const hasTableRunner = file.chunks.some(chunk =>
      chunk.changes.some(change => TABLE_RUNNER_RE.test(change.content.replace(/^[+\- ]/, ''))),
    );

    for (const chunk of file.chunks) {
      const removedBindings = deletedLines(chunk)
        .map(line => expectedBinding(line.text))
        .filter((binding): binding is { name: string; value: string } => binding !== undefined);
      for (const added of addedLines(chunk)) {
        const binding = expectedBinding(added.text);
        if (!binding) continue;
        const prior = removedBindings.find(old => old.name === binding.name && old.value !== binding.value);
        if (!prior) continue;
        findings.push({
          verifierId: 'WI109',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: `Named expected value changed from ${prior.value} to ${binding.value} with no change to the code under test, so an indirect assertion can be made to agree with the bug.`,
          suggestion: 'Change the implementation, not the expected/want binding. If the specification changed, record that reason and update the implementation in the same reviewable change.',
        });
      }

      const removed = deletedLines(chunk)
        .map(l => ({ line: l, value: expectedLiteral(l.text), key: assertionKey(l.text) }))
        .filter(x => x.value !== undefined);
      if (removed.length > 0) {
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

      if (!hasTableRunner) continue;
      const removedRows = deletedLines(chunk).filter(line => isDataRow(line.text));
      for (const added of addedLines(chunk).filter(line => isDataRow(line.text))) {
        const pair = removedRows
          .map(prior => changedTableExpectation(prior.text, added.text))
          .find((value): value is ChangedTableValue => value !== undefined);
        if (!pair) continue;
        findings.push({
          verifierId: 'WI109',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: `Expected table value changed from ${pair.before} to ${pair.after} with no change to the code under test; the test inputs stayed the same and only the expected column moved.`,
          suggestion:
            'Change the code, not the expectation table. If the old table value was genuinely wrong, record the specification change and its reason before changing the expected column.',
        });
      }
    }
  }

  return findings;
}

export const wi109: Verifier = { id: 'WI109', severity: 'error', run };
