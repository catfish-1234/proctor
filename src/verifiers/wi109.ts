import type { ParsedFile } from '../diff.js';
import type { Context, Finding, Verifier } from '../types.js';
import { sourceView, type SourceView } from './structure.js';
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

/** A non-test source file, whose presence in the diff means some behaviour genuinely moved. */
function isImplementation(context: Context, filePath: string): boolean {
  if (context.isTestFile(filePath)) return false;
  // Config, docs, lockfiles and fixtures are not the behaviour under test.
  return !/\.(?:md|json|ya?ml|toml|lock|txt|snap)$/i.test(filePath) &&
    !/(?:^|\/)(?:fixtures?|testdata|__snapshots__)\//.test(filePath.replace(/\\/g, '/'));
}

/**
 * A literal bound to a name on a line: `const accepted = 194;`, `accepted = 194`, `x := 194`.
 * The lookahead keeps `==` comparisons and `=>` arrows from reading as assignments.
 */
const LITERAL_BINDING_RE =
  /(?:^\s*|\b(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*(?::=|=(?![=>]))\s*(-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|true|false|True|False|null|None|nil)\s*(?=;|$)/g;

/** The identifier an assertion now compares against, where it used to carry a literal. */
function expectedIdentifier(text: string): string | undefined {
  const stripped = withoutTrailingComment(text);
  for (const re of EXPECTED_VALUE_PATTERNS) {
    const m = re.exec(stripped);
    if (!m) continue;
    const value = m[1]!.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(value) && !LITERAL_RE.test(value)) return value;
  }
  return undefined;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The file's stem with its test affixes removed, so `tax.test.ts`, `test_tax.py`, `tax_test.go`
 * and `TaxTest.java` all reduce to the `tax` that `tax.ts`, `tax.py` or `Tax.java` reduce to.
 */
function subjectStem(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.[^.]+$/, '');
  return base
    .replace(/[._-](?:test|tests|spec|specs)$/, '')
    .replace(/^(?:test|tests|spec)[._-]/, '')
    .replace(/(?:test|tests|spec)$/, '');
}

/** Words that name the test machinery rather than the thing under test. */
const FRAMEWORK_WORDS = new Set([
  'expect', 'tobe', 'toequal', 'tostrictequal', 'tobecloseto', 'tohavelength', 'tohavebeencalledtimes',
  'assert', 'assertequal', 'assertequals', 'equal', 'equals', 'assert_eq', 'eq', 'to', 'should',
  'it', 'test', 'describe', 'self', 'this', 'const', 'let', 'var', 'async', 'await', 'function',
  'return', 'true', 'false', 'null', 'none', 'nil', 'new', 'def', 'func', 'fn', 'is', 'not', 'and',
  'or', 'in', 'of', 'the', 'want', 'got', 'expected', 'actual', 'result', 'value', 'approx', 'pytest',
]);

/** Language keywords and builtin type names, which every source file mentions. */
const KEYWORDS = new Set([
  'export', 'import', 'from', 'default', 'class', 'interface', 'type', 'enum', 'public', 'private',
  'protected', 'static', 'readonly', 'void', 'number', 'string', 'boolean', 'object', 'array',
  'for', 'while', 'else', 'elif', 'switch', 'case', 'break', 'continue', 'throw', 'try', 'catch',
  'finally', 'int', 'str', 'float', 'bool', 'list', 'dict', 'self', 'pass', 'raise', 'with',
  'yield', 'lambda', 'package', 'struct', 'impl', 'pub', 'mut', 'use', 'mod', 'err', 'nil',
  'require', 'module', 'exports', 'end', 'begin', 'then', 'undefined', 'extends',
]);

function subjectWords(text: string): string[] {
  return [...new Set((text.match(/[A-Za-z_$][\w$]*/g) ?? [])
    .map(word => word.toLowerCase())
    .filter(word => word.length >= 3 && !FRAMEWORK_WORDS.has(word)))];
}

/** A value specific enough that finding it elsewhere says something: not 0, 1, true or ''. */
function distinctiveValue(value: string): string | undefined {
  const bare = value.replace(/^['"`]|['"`]$/g, '');
  if (/^(?:true|false|null|none|nil)$/i.test(bare)) return undefined;
  if (/^-?\d+(?:\.\d+)?$/.test(bare)) return bare.replace(/^-/, '').replace('.', '').length >= 2 ? bare : undefined;
  return bare.length >= 3 ? bare : undefined;
}

/**
 * Whether a changed implementation file plausibly explains an edited expectation.
 *
 * Editing code and its tests together is ordinary work, which is why WI109 used to go quiet the
 * moment any implementation file appeared in the change. That let the cheat hide behind an unrelated
 * fix: correct the sort order in `sort.ts`, and in the same change rewrite `tax.test.ts` to expect
 * the wrong tax. Nothing about `sort.ts` explains a new tax figure.
 *
 * So an expectation edit stays quiet when any changed implementation file is related to it, and
 * "related" is deliberately generous, since every false negative here is only a return to the old
 * behaviour: the file stems match or contain each other, the implementation's diff or path mentions
 * a word from the edited assertion, the implementation's diff contains the old or new expected
 * value, or one of the test file's own import lines names the implementation file.
 */
function explainedBy(
  testPath: string,
  testFile: ParsedFile,
  assertionText: string,
  values: string[],
  implementation: ParsedFile[],
): boolean {
  const testStem = subjectStem(testPath);
  const words = subjectWords(assertionText);
  const distinctive = values.map(distinctiveValue).filter((v): v is string => v !== undefined);
  const imports = testFile.chunks
    .flatMap(chunk => chunk.changes.map(change => change.content.slice(1)))
    .filter(line => /\b(?:import|require|from|use|using|include|load)\b/.test(line))
    .join('\n')
    .toLowerCase();

  return implementation.some(file => {
    const implPath = pathOf(file);
    const implStem = subjectStem(implPath);
    if (testStem.length >= 3 && implStem.length >= 3 &&
        (testStem === implStem || testStem.includes(implStem) || implStem.includes(testStem))) return true;
    if (implStem.length >= 3 && imports.includes(implStem)) return true;
    const implText = [implPath, ...file.chunks.flatMap(chunk => chunk.changes.map(change => change.content.slice(1)))]
      .join('\n');
    const implWords = [...new Set((implText.match(/[A-Za-z_$][\w$]*/g) ?? []).map(word => word.toLowerCase()))]
      .filter(word => word.length >= 3 && !KEYWORDS.has(word) && !FRAMEWORK_WORDS.has(word));
    if (words.some(word => implWords.some(implWord => implWord.includes(word) || word.includes(implWord)))) {
      return true;
    }
    return distinctive.some(value => implText.includes(value));
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

/**
 * A Python tuple, `(1, 2, 0.5)`, as opposed to a call's argument list, `ratio(1, 2)`: what precedes
 * the parenthesis is not part of a name, a call result or a subscript.
 */
const PY_TUPLE_SOURCE = String.raw`(?<![\w$\])'"\x60])\(([^()[\]]+)\)`;

/** True when a line is table data rather than executable test logic: literals inside a collection. */
function isDataRow(text: string, python = false): boolean {
  const stripped = withoutTrailingComment(text);
  // An executable call statement (`program.parse(['a', 'b'])`) carries literals but is not a table row.
  if (/^\s*[A-Za-z_$][\w$.]*\s*\(/.test(stripped) && !TABLE_RUNNER_RE.test(stripped)) return false;
  // pytest.mark.parametrize rows are conventionally tuples, so a tuple is a collection there too.
  const collection = /[[{]/.test(stripped) || (python && new RegExp(PY_TUPLE_SOURCE).test(stripped));
  if (!collection) return false;
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
  /** How many rows on the line had their expected column changed. */
  rows: number;
}

/**
 * A conservative table-row comparison: inputs stay byte-for-byte equal and only the final column
 * changes. Parametrised tests conventionally put the expected value last. If an input changes in
 * any row, or a row gains or loses a column, the edit is ordinary test-case maintenance and this
 * check stays silent.
 *
 * Several rows on one line may have their expected column changed together. This used to be
 * treated as too broad to infer intent, but the same rows written one per line were each reported,
 * so the only thing the rule measured was layout: `[(1, 2, 0.5), (3, 2, 1.5)]` rewritten to
 * `[(1, 2, 0), (3, 2, 1)]` went unreported purely because both tuples share a line.
 */
function changedTableExpectation(before: string, after: string, python = false): ChangedTableValue | undefined {
  const groupRe = python
    ? new RegExp(String.raw`\[([^\[\]()]+)\]|` + PY_TUPLE_SOURCE + String.raw`|\{([^{}]+)\}`, 'g')
    : /\[([^\[\]]+)\]|\{([^{}]+)\}/g;
  const rows = (text: string): string[][] => {
    const stripped = withoutTrailingComment(text);
    const nested = [...stripped.matchAll(groupRe)]
      .map(m => literalsOf(m[1] ?? m[2] ?? m[3] ?? ''))
      .filter(values => values.length >= 2);
    return nested.length > 0 ? nested : isDataRow(stripped, python) ? [literalsOf(stripped)] : [];
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
    if (changed) changed.rows++;
    else changed = { before: oldValues[last]!, after: newValues[last]!, rows: 1 };
  }
  return changed;
}

/** An expectation edit, before deciding whether the rest of the change explains it. */
interface Candidate {
  line: number;
  /** The assertion or table row as it now reads, which names what the expectation is about. */
  text: string;
  before: string;
  after: string;
  /** "Expected value changed from 3 to 4", in the form the edit took. */
  what: string;
  /** What the edit does to the test, appended after "with no change to the code under test". */
  how: string;
  suggestion: string;
}

const UNEXPLAINED =
  'The change does edit implementation code, but none of it is related to this test: no shared file ' +
  'name, no import of it, and no mention of what the assertion checks or of either value.';

function candidatesIn(file: ParsedFile, filePath: string): Candidate[] {
  const candidates: Candidate[] = [];
  const python = /\.py$/.test(filePath);
  const hashComments = /\.(?:py|rb)$/.test(filePath);
  const hasTableRunner = file.chunks.some(chunk => TABLE_RUNNER_RE.test(sourceView(chunk, 'after', hashComments).code));

  // Names bound to a literal on the new side of the file. Only a binding this change introduces
  // counts as new indirection: an assertion that already read an existing constant is not one.
  const removedText = file.chunks.flatMap(chunk => deletedLines(chunk).map(line => line.text)).join('\n');
  const addedBindings = new Map<string, string>();
  for (const chunk of file.chunks) {
    for (const line of addedLines(chunk)) {
      for (const m of withoutTrailingComment(line.text).matchAll(LITERAL_BINDING_RE)) {
        if (!new RegExp(String.raw`\b${escapeRegExp(m[1]!)}\b`).test(removedText)) addedBindings.set(m[1]!, m[2]!);
      }
    }
  }

  for (const chunk of file.chunks) {
    const before = sourceView(chunk, 'before', hashComments);
    const after = sourceView(chunk, 'after', hashComments);
    const codeAt = (view: SourceView, line: number): string => {
      const offset = view.offsetAtLine(line);
      if (offset === undefined) return '';
      const end = view.code.indexOf('\n', offset);
      return view.code.slice(offset, end < 0 ? undefined : end);
    };
    const removedLines = deletedLines(chunk).filter(line => codeAt(before, line.line).trim());
    const additions = addedLines(chunk).filter(line => codeAt(after, line.line).trim());
    const removedBindings = removedLines
      .map(line => expectedBinding(line.text))
      .filter((binding): binding is { name: string; value: string } => binding !== undefined);
    for (const added of additions) {
      const binding = expectedBinding(added.text);
      if (!binding) continue;
      const prior = removedBindings.find(old => old.name === binding.name && old.value !== binding.value);
      if (!prior) continue;
      candidates.push({
        line: added.line,
        text: added.text,
        before: prior.value,
        after: binding.value,
        what: `Named expected value changed from ${prior.value} to ${binding.value}`,
        how: ', so an indirect assertion can be made to agree with the bug.',
        suggestion: 'Change the implementation, not the expected/want binding. If the specification changed, record that reason and update the implementation in the same reviewable change.',
      });
    }

    const removed = removedLines
      .map(l => ({ line: l, value: expectedLiteral(l.text), key: assertionKey(l.text) }))
      .filter((x): x is { line: typeof x.line; value: string; key: string } => x.value !== undefined);
    if (removed.length > 0) {
      for (const added of additions) {
        const value = expectedLiteral(added.text);
        if (value !== undefined) {
          const key = assertionKey(added.text);
          // The same assertion, still asserting a plain literal, now asserting a different one.
          const prior = removed.find(r => r.key === key && r.value !== value);
          if (!prior) continue;
          candidates.push({
            line: added.line,
            text: added.text,
            before: prior.value,
            after: value,
            what: `Expected value changed from ${prior.value} to ${value}`,
            how: ', so the test now describes the current behaviour rather than the correct one.',
            suggestion:
              'Change the code, not the expectation. If the old expected value was genuinely wrong, that is a claim about the specification, so say what changed and why rather than editing the number until the suite agrees with the bug.',
          });
          continue;
        }

        // The same edit through a name the change introduces: `toBe(195)` becoming
        // `const accepted = 194; ... toBe(accepted)`. Substituting the bound literal back gives the
        // assertion the line used to be, which pairs with the removed one like any direct edit.
        const name = expectedIdentifier(added.text);
        const bound = name === undefined ? undefined : addedBindings.get(name);
        if (name === undefined || bound === undefined) continue;
        const inlined = withoutTrailingComment(added.text)
          .replace(new RegExp(String.raw`\b(?:const|let|var)\s+${escapeRegExp(name)}\s*=\s*${escapeRegExp(bound)}\s*;?`), '')
          .replace(new RegExp(String.raw`\b${escapeRegExp(name)}\b`, 'g'), bound);
        const key = assertionKey(inlined);
        const prior = removed.find(r => r.key === key && r.value !== bound);
        if (!prior) continue;
        candidates.push({
          line: added.line,
          text: added.text,
          before: prior.value,
          after: bound,
          what: `Expected value changed from ${prior.value} to ${bound} by moving it into \`${name}\``,
          how: ', so the assertion reads the same but now agrees with the current behaviour.',
          suggestion:
            'Change the code, not the expectation. Moving a literal into a named value is fine; changing it on the way is the same edit as changing it in place, and needs the same justification.',
        });
      }
    }

    if (!hasTableRunner) continue;
    const removedRows = removedLines.filter(line => isDataRow(line.text, python));
    const removedTexts = new Set(removedLines.map(line => line.text.trim()));
    for (const added of additions.filter(line => isDataRow(line.text, python) && !removedTexts.has(line.text.trim()))) {
      const pair = removedRows
        .map(prior => changedTableExpectation(prior.text, added.text, python))
        .find((value): value is ChangedTableValue => value !== undefined);
      if (!pair) continue;
      const more = pair.rows > 1 ? ` (and ${pair.rows - 1} more row${pair.rows > 2 ? 's' : ''} on the same line)` : '';
      candidates.push({
        line: added.line,
        text: added.text,
        before: pair.before,
        after: pair.after,
        what: `Expected table value changed from ${pair.before} to ${pair.after}${more}`,
        how: '; the test inputs stayed the same and only the expected column moved.',
        suggestion:
          'Change the code, not the expectation table. If the old table value was genuinely wrong, record the specification change and its reason before changing the expected column.',
      });
    }
  }
  return candidates;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];
  const implementation = context.files.filter(f => pathOf(f) && isImplementation(context, pathOf(f)));

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath || !context.isTestFile(filePath)) continue;

    for (const candidate of candidatesIn(file, filePath)) {
      if (implementation.length === 0) {
        // Nothing but expectations moved: the original, blocking form of this check.
        findings.push({
          verifierId: 'WI109',
          severity: 'error',
          file: filePath,
          line: candidate.line,
          message: `${candidate.what} with no change to the code under test${candidate.how}`,
          suggestion: candidate.suggestion,
        });
        continue;
      }
      // Implementation moved too. Updating a test alongside the code it describes is ordinary work,
      // so only an edit that nothing in the change accounts for is reported, and as a warning: the
      // relation between a test and the code it covers is inferred here, not known.
      if (explainedBy(filePath, file, candidate.text, [candidate.before, candidate.after], implementation)) continue;
      findings.push({
        verifierId: 'WI109',
        severity: 'warn',
        file: filePath,
        line: candidate.line,
        message: `${candidate.what}. ${UNEXPLAINED}`,
        suggestion: candidate.suggestion,
      });
    }
  }

  return findings;
}

export const wi109: Verifier = { id: 'WI109', severity: 'error', run };
