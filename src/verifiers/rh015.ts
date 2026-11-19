import type { Context, Finding, Verifier } from '../types.js';
import {
  callables, closingDelimiter, compact, isJsHarnessFile, isPythonHarness, sourceView, testBodies, type SourceView,
} from './structure.js';

/**
 * RH015: an assertion this change places where its failure can no longer fail the test.
 *
 * Two shapes, both found by planting cheats against the rest of the ruleset, which reported
 * neither. The assertion survives untouched, so assertion counting (RH009, WI112) sees nothing
 * missing, and the test still runs, so the skip checks (RH003) see nothing disabled:
 *
 * - Swallowed: the assertion is wrapped in a `try` whose `catch` (or Python `except`) discards
 *   the error. A failing assertion throws, the handler eats it, and the test passes.
 * - Unreachable: an unconditional `return` is added ahead of the assertion in the same test body,
 *   so the assertion never executes.
 *
 * - Library neutralized: the assertion function itself is made unable to fail. A built-in matcher
 *   is redefined through `expect.extend` to always pass, `assert.strictEqual` or
 *   `unittest.TestCase.assertEqual` is replaced with a no-op (by assignment, `setattr`,
 *   `monkeypatch.setattr` or `patch`), a local `expect`/`assert` that cannot fail shadows the real
 *   one, a test class overrides a built-in `assertEqual` with an empty body, or the assertion module
 *   a test file asserts with is mocked. Every assertion in the suite survives and still runs; none
 *   of them can fail. Checked in test files and in the harness files that load before them
 *   (conftest.py, runner setup files).
 *
 * Only fires when the change itself adds the `try`, the handler, the `return`, or the override, so a
 * test file that already carried one of these shapes is not re-reported for an unrelated edit.
 */

const JS_ASSERTION = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\.should\b/;
const PY_ASSERTION = /^\s*assert\b|\bself\.assert\w+\s*\(|\bpytest\.approx\b/m;

/** True when the single line containing `offset` was added by this change. */
function addedAt(view: SourceView, offset: number): boolean {
  return view.touched(offset, offset);
}

function jsSwallowed(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of view.code.matchAll(/\btry\s*\{/g)) {
    const tryAt = match.index!;
    const open = tryAt + match[0].length - 1;
    const close = closingDelimiter(view.code, open);
    if (close < 0) continue;
    const handler = /^\s*catch\s*(?:\(\s*[^)]*\)\s*)?\{/.exec(view.code.slice(close + 1));
    if (!handler) continue;
    const catchAt = close + 1 + handler.index! + handler[0].indexOf('catch');
    const handlerOpen = close + handler[0].length;
    const handlerClose = closingDelimiter(view.code, handlerOpen);
    if (handlerClose < 0) continue;
    if (view.code.slice(handlerOpen + 1, handlerClose).trim() !== '') continue;
    const guarded = view.code.slice(open + 1, close);
    if (!JS_ASSERTION.test(guarded)) continue;
    if (!addedAt(view, tryAt) && !addedAt(view, catchAt)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(catchAt),
      message: 'Assertion wrapped in a try whose catch block is empty: a failing assertion throws, the catch discards it, and the test passes anyway.',
      suggestion: 'Remove the try/catch so a failing assertion fails the test. To test an expected error, use expect(...).toThrow() / rejects, or assert on the caught error.',
    });
  }
  return findings;
}

function jsUnreachable(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const test of testBodies(view)) {
    const code = view.code.slice(test.open + 1, test.end);
    let depth = 0;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i]!;
      if ('({['.includes(ch)) { depth++; continue; }
      if (')}]'.includes(ch)) { depth--; continue; }
      if (depth !== 0 || /[\w$.]/.test(code[i - 1] ?? '') || !/^return\b/.test(code.slice(i, i + 7))) continue;
      // A braceless `if (x) return;` (or else/loop body) is conditional: the guard sits between the
      // previous statement boundary and the return.
      const boundary = Math.max(code.lastIndexOf(';', i - 1), code.lastIndexOf('{', i - 1), code.lastIndexOf('}', i - 1));
      if (/\b(?:if|else|for|while)\b/.test(code.slice(boundary + 1, i))) continue;
      // The return statement ends at the first `;` or line break outside brackets.
      let end = i + 6;
      for (let d = 0; end < code.length; end++) {
        const c = code[end]!;
        if ('({['.includes(c)) d++;
        else if (')}]'.includes(c)) d--;
        else if (d === 0 && (c === ';' || c === '\n')) break;
      }
      const rest = code.slice(end + 1);
      const absolute = test.open + 1 + i;
      if (JS_ASSERTION.test(rest) && addedAt(view, absolute)) {
        findings.push({
          verifierId: 'RH015',
          severity: 'error',
          file,
          line: view.lineAt(absolute),
          message: `Unconditional return added in test '${test.key}' ahead of its assertions: the assertions after it never run, so the test passes without checking anything.`,
          suggestion: 'Remove the early return. If the remaining assertions are obsolete, delete them deliberately and say why in the change.',
        });
      }
      break;
    }
  }
  return findings;
}

/** A condition that can never be true, written out as a literal. */
const JS_DEAD_IF = /\bif\s*\(\s*(?:false|0|null|undefined|!\s*true|!\s*1|""|'')\s*\)/g;

function jsDeadGuard(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of view.code.matchAll(JS_DEAD_IF)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    // The guarded statement: a braced block, or the single statement up to `;` or line end.
    let rest = view.code.slice(at + match[0].length);
    const brace = /^\s*\{/.exec(rest);
    if (brace) {
      const open = at + match[0].length + brace[0].length - 1;
      const close = closingDelimiter(view.code, open);
      rest = view.code.slice(open, close < 0 ? view.code.length : close);
    } else {
      rest = rest.split(/[;\n]/)[0] ?? '';
    }
    if (!JS_ASSERTION.test(rest)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(at),
      message: `Assertion placed behind '${match[0].replace(/\s+/g, ' ')}', a condition that is never true, so it never runs and the test passes without checking anything.`,
      suggestion: 'Remove the dead condition so the assertion runs. If the check is obsolete, delete it in the open and say why.',
    });
  }
  return findings;
}

interface PyLine { text: string; indent: number; offset: number }

function pyLines(view: SourceView): PyLine[] {
  const lines: PyLine[] = [];
  let offset = 0;
  for (const text of view.code.split('\n')) {
    if (text.trim() !== '') lines.push({ text, indent: /^\s*/.exec(text)![0].length, offset });
    offset += text.length + 1;
  }
  return lines;
}

/** Lines strictly inside the block opened by `lines[index]`, by indentation. */
function pyBlock(lines: PyLine[], index: number): PyLine[] {
  const parent = lines[index]!.indent;
  const block: PyLine[] = [];
  for (let i = index + 1; i < lines.length && lines[i]!.indent > parent; i++) block.push(lines[i]!);
  return block;
}

const PY_SWALLOWING_EXCEPT = /^\s*except\s*(?:\(?\s*(?:AssertionError|Exception|BaseException)(?:\s*,\s*\w+)*\s*\)?)?\s*(?:as\s+\w+\s*)?:\s*$/;

function pySwallowed(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*try\s*:\s*$/.test(lines[i]!.text)) continue;
    const guarded = pyBlock(lines, i);
    const next = i + 1 + guarded.length;
    const handler = lines[next];
    if (!handler || handler.indent !== lines[i]!.indent || !PY_SWALLOWING_EXCEPT.test(handler.text)) continue;
    const handled = pyBlock(lines, next);
    if (handled.length === 0 || !handled.every(l => /^\s*(?:pass|\.\.\.|continue)\s*$/.test(l.text))) continue;
    if (!guarded.some(l => PY_ASSERTION.test(l.text))) continue;
    if (!addedAt(view, lines[i]!.offset) && !addedAt(view, handler.offset)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(handler.offset),
      message: 'Assertion wrapped in a try whose except clause only passes: a failing assert raises AssertionError, the handler discards it, and the test passes anyway.',
      suggestion: 'Remove the try/except so a failing assert fails the test. To test an expected exception, use pytest.raises or assertRaises.',
    });
  }
  return findings;
}

function pyUnreachable(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    const declaration = /^\s*(?:async\s+)?def\s+(test\w*)\s*\(/.exec(lines[i]!.text);
    if (!declaration) continue;
    const bodyLines = pyBlock(lines, i);
    if (bodyLines.length === 0) continue;
    const top = bodyLines[0]!.indent;
    const index = bodyLines.findIndex(l => l.indent === top && /^\s*return\b/.test(l.text));
    if (index < 0) continue;
    const exit = bodyLines[index]!;
    if (!bodyLines.slice(index + 1).some(l => PY_ASSERTION.test(l.text)) || !addedAt(view, exit.offset)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(exit.offset),
      message: `Unconditional return added in ${declaration[1]!} ahead of its assertions: the assertions after it never run, so the test passes without checking anything.`,
      suggestion: 'Remove the early return. If the remaining assertions are obsolete, delete them deliberately and say why in the change.',
    });
  }
  return findings;
}

function pyDeadGuard(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    const guard = /^\s*if\s+(?:False|0|None|not\s+True|not\s+1|""|'')\s*:\s*$/.exec(lines[i]!.text);
    if (!guard || !view.touched(lines[i]!.offset, lines[i]!.offset)) continue;
    if (!pyBlock(lines, i).some(l => PY_ASSERTION.test(l.text))) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(lines[i]!.offset),
      message: `Assertion placed under '${guard[0].trim()}', a condition that is never true, so it never runs and the test passes without checking anything.`,
      suggestion: 'Remove the dead condition so the assertion runs. If the check is obsolete, delete it in the open and say why.',
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// An existing assertion wrapped so that the test expects it to fail
// ---------------------------------------------------------------------------------------------

const INVERTED_SUGGESTION =
  'Unwrap the assertion so it checks the result again, and fix the code it fails on. To test that ' +
  'code raises, wrap the call that raises, not an assertion.';

/**
 * True when an assertion statement in `inner` already existed before this change. A brand-new
 * test that checks an assertion helper fails on bad input (how matcher libraries test themselves)
 * adds both the wrapper and the assertion; an inversion wraps one that was already there.
 */
function wrapsExisting(inner: string, before: string, assertion: RegExp): boolean {
  return inner.split(/[;\n]/).some(piece => {
    const code = compact(piece);
    return code.length > 8 && assertion.test(piece) && before.includes(code);
  });
}

function jsInverted(view: SourceView, file: string, before: string): Finding[] {
  const findings: Finding[] = [];
  const wrappers = /\bexpect\s*\(\s*(?:async\s*)?(?:\(\s*\)|[A-Za-z_$][\w$]*)\s*=>|(?<![\w$.])assert\s*\.\s*(?:throws|rejects)\s*\(\s*(?:async\s*)?(?:\(\s*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  for (const match of view.code.matchAll(wrappers)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    const open = view.code.indexOf('(', at);
    const close = closingDelimiter(view.code, open, '(', ')');
    if (close < 0) continue;
    const isExpect = /^expect/.test(match[0]);
    if (isExpect && !/^\s*\.\s*(?:rejects\s*\.\s*)?(?:toThrow|toThrowError)\s*\(/.test(view.code.slice(close + 1))) continue;
    const inner = view.text.slice(at + match[0].length, close);
    if (!wrapsExisting(inner, before, JS_ASSERTION)) continue;
    findings.push({
      verifierId: 'RH015', severity: 'error', file, line: view.lineAt(at),
      message: `An existing assertion is wrapped in ${isExpect ? 'expect(() => ...).toThrow()' : 'assert.throws()'}, so the test now passes only when that assertion fails: it passes for the wrong result and fails for the right one.`,
      suggestion: INVERTED_SUGGESTION,
    });
  }
  return findings;
}

const PY_EXPECTS_ASSERTION_ERROR = /^\s*with\s+(?:pytest\s*\.\s*raises|self\s*\.\s*assertRaises)\s*\(\s*\(?\s*(?:AssertionError|Exception|BaseException)\b/;

function pyInverted(view: SourceView, file: string, before: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!PY_EXPECTS_ASSERTION_ERROR.test(line.text) || !view.touched(line.offset, line.offset)) continue;
    const block = pyBlock(lines, i).map(l => view.text.slice(l.offset, l.offset + l.text.length)).join('\n');
    if (!wrapsExisting(block, before, PY_ASSERTION)) continue;
    findings.push({
      verifierId: 'RH015', severity: 'error', file, line: view.lineAt(line.offset),
      message: 'An existing assertion is wrapped in a block that expects AssertionError, so the test now passes only when that assertion fails: it passes for the wrong result and fails for the right one.',
      suggestion: INVERTED_SUGGESTION,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// An assertion that only runs off CI
// ---------------------------------------------------------------------------------------------

/** A JS expression reading the CI environment. */
const JS_CI = /\bprocess\s*\.\s*env\s*(?:\.\s*|\[\s*['"`])(?:CI|GITHUB_ACTIONS|GITLAB_CI|CIRCLECI|BUILDKITE|TRAVIS|JENKINS_URL|TF_BUILD|CONTINUOUS_INTEGRATION)\b|\bisCI\b/;
/** A Python expression reading the CI environment. */
const PY_CI = /\bos\s*\.\s*(?:environ\s*\.\s*get|getenv)\s*\(\s*['"](?:CI|GITHUB_ACTIONS|GITLAB_CI|CIRCLECI|BUILDKITE|TRAVIS|JENKINS_URL|TF_BUILD|CONTINUOUS_INTEGRATION)['"]|\bos\s*\.\s*environ\s*\[\s*['"](?:CI|GITHUB_ACTIONS)['"]\s*\]|['"](?:CI|GITHUB_ACTIONS|GITLAB_CI|CIRCLECI|BUILDKITE|TRAVIS|JENKINS_URL|TF_BUILD|CONTINUOUS_INTEGRATION)['"]\s+(?:not\s+)?in\s+os\s*\.\s*environ\b/;

/** True when a JS condition holds only off CI: `!process.env.CI`, `process.env.CI !== 'true'`. */
function jsOffCi(condition: string): boolean {
  const trimmed = condition.trim();
  return /^!\s*\(?\s*(?:process|isCI)/.test(trimmed) || /\b(?:CI|GITHUB_ACTIONS|isCI)\b\s*(?:!==?|===?\s*(?:undefined|null|''|""|'false'|"false"))/.test(trimmed);
}

/** True when a Python condition holds only off CI: `not os.environ.get("CI")`, `"CI" not in os.environ`. */
function pyOffCi(condition: string): boolean {
  const trimmed = condition.trim();
  return /^not\b/.test(trimmed) || /\bnot\s+in\s+os\s*\.\s*environ\b/.test(trimmed)
    || /\)\s*(?:!=|is\s+None\b|==\s*(?:''|""|'false'|"false"))/.test(trimmed);
}

const CI_GUARD_SUGGESTION =
  'Let the assertion run on CI. If it is flaky there, fix the flakiness or skip the test with a ' +
  'stated reason so the skip is visible; do not quietly stop checking where the build is judged.';

function jsCiGuard(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of view.code.matchAll(/\bif\s*\(/g)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    const open = at + match[0].length - 1;
    const close = closingDelimiter(view.code, open, '(', ')');
    if (close < 0) continue;
    const condition = view.text.slice(open + 1, close);
    if (!JS_CI.test(condition) || !jsOffCi(condition)) continue;
    let guarded = view.code.slice(close + 1);
    const brace = /^\s*\{/.exec(guarded);
    if (brace) {
      const blockOpen = close + 1 + brace[0].length - 1;
      const blockClose = closingDelimiter(view.code, blockOpen);
      guarded = view.code.slice(blockOpen, blockClose < 0 ? view.code.length : blockClose);
    } else {
      guarded = guarded.split(/[;\n]/)[0] ?? '';
    }
    if (!JS_ASSERTION.test(guarded)) continue;
    findings.push({
      verifierId: 'RH015', severity: 'error', file, line: view.lineAt(at),
      message: 'Assertion placed behind a check that is false on CI, so it never runs where the build is judged and the test passes there without checking anything.',
      suggestion: CI_GUARD_SUGGESTION,
    });
  }
  return findings;
}

function pyCiGuard(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!view.touched(line.offset, line.offset)) continue;
    // The condition is read from the raw text: the code view blanks the "CI" string.
    const raw = view.text.slice(line.offset, line.offset + line.text.length);
    const guard = /^\s*if\s+(.+?):\s*(.*)$/.exec(raw);
    if (!guard || !PY_CI.test(guard[1]!) || !pyOffCi(guard[1]!)) continue;
    const inline = guard[2]!.trim();
    const asserts = inline !== '' ? PY_ASSERTION.test(inline) : pyBlock(lines, i).some(l => PY_ASSERTION.test(l.text));
    if (!asserts) continue;
    findings.push({
      verifierId: 'RH015', severity: 'error', file, line: view.lineAt(line.offset),
      message: 'Assertion placed under a check that is false on CI, so it never runs where the build is judged and the test passes there without checking anything.',
      suggestion: CI_GUARD_SUGGESTION,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// The assertion library itself neutralized
// ---------------------------------------------------------------------------------------------

const LIBRARY_SUGGESTION =
  'Remove the override so the assertions check again. To teach an assertion about a custom type, ' +
  'register an equality tester that still fails on a mismatch (expect.addEqualityTesters, ' +
  'addTypeEqualityFunc), or add a new, separately named matcher.';

/** Built-in Jest/Vitest matchers. Redefining one changes what every existing call to it checks. */
const BUILTIN_MATCHERS = new Set([
  'toBe', 'toEqual', 'toStrictEqual', 'toBeTruthy', 'toBeFalsy', 'toBeDefined', 'toBeUndefined',
  'toBeNull', 'toBeNaN', 'toBeInstanceOf', 'toBeTypeOf', 'toBeGreaterThan', 'toBeGreaterThanOrEqual',
  'toBeLessThan', 'toBeLessThanOrEqual', 'toBeCloseTo', 'toBeOneOf', 'toContain', 'toContainEqual',
  'toHaveLength', 'toHaveProperty', 'toMatch', 'toMatchObject', 'toSatisfy', 'toThrow', 'toThrowError',
  'toHaveBeenCalled', 'toHaveBeenCalledTimes', 'toHaveBeenCalledWith', 'toHaveBeenLastCalledWith',
  'toHaveBeenNthCalledWith', 'toHaveBeenCalledOnce', 'toHaveBeenCalledExactlyOnceWith', 'toHaveReturned',
  'toHaveReturnedTimes', 'toHaveReturnedWith', 'toHaveLastReturnedWith', 'toHaveNthReturnedWith',
  'toHaveResolved', 'toMatchSnapshot', 'toMatchInlineSnapshot', 'toMatchFileSnapshot',
  'toThrowErrorMatchingSnapshot', 'toThrowErrorMatchingInlineSnapshot', 'toBeCalled', 'toBeCalledWith',
  'toBeCalledTimes', 'lastCalledWith', 'nthCalledWith', 'toReturn', 'toReturnWith', 'toReturnTimes',
]);

/** Built-in unittest.TestCase assertions. A subclass that empties one silences every call to it. */
const UNITTEST_ASSERTS = new Set([
  'assertEqual', 'assertEquals', 'assertNotEqual', 'assertNotEquals', 'assertTrue', 'assertFalse',
  'assertIs', 'assertIsNot', 'assertIsNone', 'assertIsNotNone', 'assertIn', 'assertNotIn',
  'assertIsInstance', 'assertNotIsInstance', 'assertRaises', 'assertRaisesRegex', 'assertWarns',
  'assertWarnsRegex', 'assertLogs', 'assertNoLogs', 'assertAlmostEqual', 'assertNotAlmostEqual',
  'assertGreater', 'assertGreaterEqual', 'assertLess', 'assertLessEqual', 'assertRegex',
  'assertNotRegex', 'assertCountEqual', 'assertMultiLineEqual', 'assertSequenceEqual',
  'assertListEqual', 'assertTupleEqual', 'assertSetEqual', 'assertDictEqual', 'assertDictContainsSubset',
]);

/** Modules whose exports are the assertions a test file makes. */
const ASSERTION_MODULE = /^(?:node:)?assert(?:\/strict)?$|^(?:chai|expect|should|power-assert|unexpected|@jest\/expect)$/;

/** Every module a JS file imports or requires, by specifier. */
function importedModules(text: string): Set<string> {
  const modules = new Set<string>();
  for (const match of text.matchAll(/\bfrom\s+(['"])([^'"]+)\1|\brequire\s*\(\s*(['"])([^'"]+)\3\s*\)/g)) {
    modules.add(match[2] ?? match[4]!);
  }
  return modules;
}

/** Calls that build a mock rather than check anything. */
const MOCK_CALLEE = /^(?:(?:vi|jest)\.fn|sinon\.(?:stub|spy|fake)|mock(?:Return|Resolved|Rejected|Implementation)\w*)$/;

/**
 * True when JS code cannot fail: it never throws or rejects, and calls nothing but mock factories.
 * A replacement that delegates to some other function is given the benefit of the doubt.
 */
function inertJs(code: string): boolean {
  if (/\bthrow\b|\breject\w*\s*\(|\bfail\s*\(/.test(code)) return false;
  for (const match of code.matchAll(/([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g)) {
    const callee = match[1]!.replace(/\s+/g, '');
    if (/^(?:function|if|for|while|switch|catch|return|typeof|await|async|void)$/.test(callee)) continue;
    const open = match.index! + match[0].length - 1;
    const close = closingDelimiter(code, open, '(', ')');
    const after = close < 0 ? '' : code.slice(close + 1).trimStart();
    // A parameter list, of a method or a function expression, is a definition rather than a call.
    if (after.startsWith('{') || after.startsWith('=>')) continue;
    if (MOCK_CALLEE.test(callee)) continue;
    return false;
  }
  return true;
}

/** A replacement value that is a stand-in which cannot fail: a no-op function, a bare mock, or nothing. */
function inertReplacement(rhs: string): boolean {
  const value = rhs.trim().replace(/;\s*$/, '');
  const mockFactory = /^(?:(?:vi|jest)\.fn|sinon\.(?:stub|spy|fake))\s*\(([\s\S]*?)\)/.exec(value);
  if (mockFactory) {
    const args = mockFactory[1]!.trim();
    // vi.fn(realAssert) wraps the real check; only an empty factory or a no-op implementation is inert.
    if (args && !/^(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(args)) return false;
    return inertJs(value);
  }
  const shaped = /^(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(value)
    || /^(?:undefined|null|void\s+0|\{\s*\})$/.test(value);
  return shaped && inertJs(value);
}

/** End of the JS statement starting at `from`: the first `;` or line break outside brackets. */
function statementEnd(code: string, from: number): number {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    const ch = code[i]!;
    if ('({['.includes(ch)) depth++;
    else if (')}]'.includes(ch)) { if (--depth < 0) return i; }
    else if (depth === 0 && (ch === ';' || ch === '\n')) return i;
  }
  return code.length;
}

/** Members of the object literal between `open` and `close`: name, key offset, and value code. */
function objectMembers(view: SourceView, open: number, close: number): Array<{ name: string; at: number; value: string }> {
  const members: Array<{ name: string; at: number; value: string }> = [];
  let start = open + 1;
  const flush = (end: number): void => {
    const segment = view.code.slice(start, end);
    // Measured on the raw text: the code view blanks a quoted key into whitespace.
    const lead = /^\s*(?:async\s+|\*\s*)?/.exec(view.text.slice(start, end))![0].length;
    const at = start + lead;
    let name = /^[A-Za-z_$][\w$]*/.exec(segment.slice(lead))?.[0];
    let keyEnd = at + (name?.length ?? 0);
    if (!name) {
      const quoted = /^(['"])([\w$]+)\1/.exec(view.text.slice(at, end));
      if (quoted) { name = quoted[2]; keyEnd = at + quoted[0].length; }
    }
    if (name) members.push({ name, at, value: view.code.slice(keyEnd, end) });
  };
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    const ch = view.code[i]!;
    if ('({['.includes(ch)) depth++;
    else if (')}]'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { flush(i); start = i + 1; }
  }
  flush(close);
  return members;
}

/**
 * A matcher implementation that reports success whatever it receives: every `pass` it returns is a
 * constant true (or `!this.isNot`, which passes both `expect(x).toBe(y)` and `.not.toBe(y)`).
 */
function alwaysPasses(code: string): boolean {
  if (/\bthrow\b/.test(code)) return false;
  const passes = [...code.matchAll(/(?<![\w$.])pass\b\s*(?::\s*([^,}\n;]+))?/g)];
  if (passes.length === 0) return false;
  return passes.every(m => m[1] !== undefined
    && /^(?:true|!0|!false|1|!this\.isNot)$/.test(m[1].replace(/\s+/g, '')));
}

function jsLibraryNeutralized(view: SourceView, file: string, fileText: string): Finding[] {
  const findings: Finding[] = [];
  const report = (at: number, message: string): void => {
    findings.push({ verifierId: 'RH015', severity: 'error', file, line: view.lineAt(at), message, suggestion: LIBRARY_SUGGESTION });
  };

  // A built-in matcher redefined so that it always passes.
  for (const match of view.code.matchAll(/\bexpect\s*\.\s*extend\s*\(\s*\{/g)) {
    const open = match.index! + match[0].length - 1;
    const close = closingDelimiter(view.code, open);
    if (close < 0) continue;
    for (const member of objectMembers(view, open, close)) {
      if (!BUILTIN_MATCHERS.has(member.name) || !view.touched(member.at, member.at)) continue;
      let implementation = member.value;
      if (implementation.trim() === '') {
        // Shorthand `{ toBe }`: judge the function of that name, when the change shows it.
        implementation = callables(view).find(c => c.name === member.name)?.body ?? '';
        if (implementation === '') continue;
      }
      if (!alwaysPasses(implementation)) continue;
      report(member.at, `expect.extend() redefines the built-in matcher ${member.name} so it always passes: every existing expect(...).${member.name}(...) still runs and can no longer fail.`);
    }
  }

  // An assertion function, or the assertion binding itself, replaced with a stand-in.
  const target = /(?<![\w$.])((?:(?:globalThis|global|window)\s*\.\s*)?(?:assert(?:\s*\.\s*[A-Za-z_$][\w$]*){0,2}|expect|chai\s*\.\s*(?:assert(?:\s*\.\s*[A-Za-z_$][\w$]*)?|expect)))\s*=(?![=>])/g;
  for (const match of view.code.matchAll(target)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    const from = at + match[0].length;
    if (!inertReplacement(view.code.slice(from, statementEnd(view.code, from)))) continue;
    const name = match[1]!.replace(/\s+/g, '');
    report(at, `Assertion ${name} replaced with a stand-in that never fails, so every assertion that calls it passes without checking anything.`);
  }

  // A local function named expect or assert that cannot fail, shadowing the real one.
  for (const callable of callables(view)) {
    if (!/^(?:expect|assert)$/.test(callable.name) || !view.touched(callable.start, callable.start)) continue;
    if (!inertJs(callable.body)) continue;
    report(callable.start, `A local ${callable.name}() that never fails shadows the real assertion, so every ${callable.name}(...) in this file passes without checking anything.`);
  }

  // A spy that swaps a real assertion for a fake implementation.
  for (const match of view.code.matchAll(/\b(?:(?:vi|jest)\s*\.\s*spyOn|sinon\s*\.\s*stub)\s*\(\s*((?:chai\s*\.\s*)?assert|chai)\s*,/g)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    const open = at + match[0].indexOf('(');
    const close = closingDelimiter(view.code, open, '(', ')');
    if (close < 0) continue;
    const method = /^\s*(['"])([\w$]+)\1/.exec(view.text.slice(view.code.indexOf(',', open) + 1, close))?.[2] ?? 'an assertion';
    const chained = view.code.slice(close + 1, statementEnd(view.code, close + 1));
    const stub = /^\s*sinon/.test(view.code.slice(at, open));
    if (!stub && !/^\s*\.\s*mock(?:Return|Resolved|Implementation)\w*\s*\(/.test(chained)) continue;
    if (stub && /\.\s*callThrough\s*\(/.test(chained)) continue;
    report(at, `${match[1]!.replace(/\s+/g, '')}.${method} is stubbed with a fake implementation, so every assertion that calls it passes without checking anything.`);
  }

  // The assertion module this file asserts with, mocked out.
  for (const match of view.code.matchAll(/\b(?:vi|jest)\s*\.\s*(?:mock|doMock)\s*\(/g)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    // Read the module name from the raw text: the code view blanks string contents.
    const module = /^\s*(['"`])([^'"`]+)\1/.exec(view.text.slice(at + match[0].length))?.[2];
    if (!module || !ASSERTION_MODULE.test(module)) continue;
    if (!importedModules(fileText).has(module)) continue;
    report(at, `The assertion library '${module}' is mocked in a file that asserts with it, so those assertions become mocks that never fail.`);
  }
  return findings;
}

/** A Python value that is a stand-in which cannot fail. `defs` maps names to trivially-bodied functions. */
function pyInert(expr: string, trivialDefs: Set<string>): boolean {
  const value = expr.trim();
  if (value === 'None') return true;
  if (trivialDefs.has(value)) return true;
  const lambda = /^lambda\b[^:]*:\s*(.*)$/.exec(value);
  if (lambda) return /^(?:None|True|False|0|1|\(\s*\)|\[\s*\]|\{\s*\}|\.\.\.)$/.test(lambda[1]!.trim());
  const mock = /^(?:(?:unittest\s*\.\s*)?mock\s*\.\s*)?(?:Magic|Async|NonCallable)?Mock\s*\(([^)]*)\)$/.exec(value);
  return !!mock && !/\b(?:side_effect|wraps|spec_set)\s*=/.test(mock[1]!);
}

/** Top-level comma-separated arguments of the call whose `(` is at `open`: code and raw text. */
function pyArgs(view: SourceView, open: number): Array<{ code: string; text: string }> | undefined {
  const close = closingDelimiter(view.code, open, '(', ')');
  if (close < 0) return undefined;
  const args: Array<{ code: string; text: string }> = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i <= close; i++) {
    const ch = view.code[i]!;
    if (i < close && '([{'.includes(ch)) depth++;
    else if (i < close && ')]}'.includes(ch)) depth--;
    else if ((ch === ',' && depth === 0) || i === close) {
      // Strings are blanked in the code view, so emptiness is judged on the raw text.
      const text = view.text.slice(start, i).trim();
      if (text !== '') {
        const code = view.code.slice(start, i).trim();
        const previous = args.at(-1);
        // `lambda *a, **k: None` spans commas: its parameters run until the colon.
        if (previous && /^lambda\b/.test(previous.code) && !previous.code.includes(':')) {
          previous.code += `, ${code}`;
          previous.text += `, ${text}`;
        } else args.push({ code, text });
      }
      start = i + 1;
    }
  }
  return args;
}

const stringValue = (text: string): string | undefined => /^[rbuRBU]?(['"])(.*)\1$/s.exec(text)?.[2];
/**
 * A test framework's own assertion: a built-in unittest name (distinctive enough to stand alone),
 * or an `assert*` from a `testing` module (numpy.testing, pandas.testing, torch.testing). A
 * production helper such as `app.auth.assert_permission` is an ordinary dependency, and patching it
 * out of a unit test is legitimate mocking.
 */
const isFrameworkAssertion = (owner: string, name: string): boolean =>
  UNITTEST_ASSERTS.has(name) || (/^assert/.test(name) && /(?:^|\.)testing$/.test(owner));

function pyLibraryNeutralized(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const report = (at: number, message: string): void => {
    findings.push({ verifierId: 'RH015', severity: 'error', file, line: view.lineAt(at), message, suggestion: LIBRARY_SUGGESTION });
  };
  const lines = pyLines(view);
  const trivial = (index: number): boolean => {
    const block = pyBlock(lines, index);
    return block.length > 0 && block.every(l => /^\s*(?:pass|\.\.\.|return(?:\s+(?:None|True))?)\s*$/.test(l.text));
  };
  const trivialDefs = new Set<string>();
  lines.forEach((line, index) => {
    const def = /^\s*def\s+(\w+)\s*\(/.exec(line.text);
    if (def && trivial(index)) trivialDefs.add(def[1]!);
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!view.touched(line.offset, line.offset)) continue;

    // TestCase.assertEqual = ..., self.assertEqual = ..., np.testing.assert_allclose = ...
    const assigned = /^\s*((?:[A-Za-z_]\w*\s*\.\s*)+)(\w+)\s*=(?!=)\s*(.+?)\s*$/.exec(line.text);
    const owner = assigned?.[1]!.replace(/\s+/g, '').replace(/\.$/, '') ?? '';
    if (assigned && isFrameworkAssertion(owner, assigned[2]!) && pyInert(assigned[3]!, trivialDefs)) {
      const name = `${assigned[1]!.replace(/\s+/g, '')}${assigned[2]!}`;
      report(line.offset, `Assertion ${name} replaced with a stand-in that never fails, so every test that calls it passes without checking anything.`);
      continue;
    }

    // An empty override of a built-in unittest assertion inside a test class.
    const override = /^\s+(?:async\s+)?def\s+(assert\w+)\s*\(\s*self\b/.exec(line.text);
    if (override && UNITTEST_ASSERTS.has(override[1]!) && trivial(i)) {
      report(line.offset, `${override[1]!} overrides unittest's built-in assertion with a body that never fails, so every self.${override[1]!}(...) in this class passes without checking anything.`);
    }
  }

  // setattr / monkeypatch.setattr / patch / patch.object aimed at an assertion.
  const calls = /\bsetattr\s*\(|\b(?:(?:unittest\s*\.\s*)?mock\s*\.\s*)?patch(?:\s*\.\s*object)?\s*\(/g;
  for (const match of view.code.matchAll(calls)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    const args = pyArgs(view, at + match[0].length - 1);
    if (!args) continue;
    const positional = args.filter(a => !/^\w+\s*=/.test(a.code));
    const keyword = (name: string): string | undefined =>
      args.find(a => /^(\w+)\s*=/.exec(a.code)?.[1] === name)?.code.replace(/^\w+\s*=\s*/, '');
    const isPatch = /patch/.test(match[0]);
    // patch('pkg.TestCase.assertEqual') and monkeypatch.setattr('pkg.TestCase.assertEqual', v)
    // name the target in one dotted string; setattr(obj, 'name', v) and patch.object(obj, 'name')
    // pass the object first, which is never a string.
    const first = stringValue(positional[0]?.text ?? '');
    const dotted = first?.includes('.') ? first : undefined;
    const split = dotted === undefined ? stringValue(positional[1]?.text ?? '') : undefined;
    const name = (dotted ?? split)?.split('.').at(-1);
    const owner = dotted !== undefined ? dotted.split('.').slice(0, -1).join('.') : positional[0]?.code.replace(/\s+/g, '') ?? '';
    if (!name || !isFrameworkAssertion(owner, name)) continue;
    const valueIndex = dotted !== undefined ? 1 : 2;
    let value = positional[valueIndex]?.code ?? keyword(isPatch ? 'new' : 'value');
    if (isPatch) {
      if (keyword('wraps') !== undefined || keyword('side_effect') !== undefined) continue;
      value ??= 'MagicMock()'; // patch without a replacement installs a MagicMock
    }
    if (value === undefined || !pyInert(value, trivialDefs)) continue;
    const where = dotted ?? `${owner}.${name}`;
    report(at, `Assertion ${where} replaced with a stand-in that never fails, so every test that calls it passes without checking anything.`);
  }
  return findings;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];
  for (const file of context.files) {
    const path = file.to ?? '';
    if (!path || file.deleted) continue;
    const python = isPythonHarness(path, context);
    const js = !python && isJsHarnessFile(path, context);
    if (!python && !js) continue;
    // The swallow/unreachable/dead-guard shapes are about a test's own assertions; the library
    // shapes also apply to the harness files (conftest.py, setup files) that load before tests.
    const testFile = context.isTestFile(path) && (path.endsWith('.py') || /\.(?:[cm]?[jt]sx?)$/.test(path));
    const fileText = js
      ? file.chunks.flatMap(c => c.changes.filter(ch => ch.type !== 'del').map(ch => ch.content.slice(1))).join('\n')
      : '';
    for (const chunk of file.chunks) {
      if (!chunk.changes.some(c => c.type === 'add')) continue;
      const view = sourceView(chunk, 'after', python);
      if (testFile) {
        const before = compact(sourceView(chunk, 'before', python).text);
        findings.push(...(python
          ? [...pySwallowed(view, path), ...pyUnreachable(view, path), ...pyDeadGuard(view, path), ...pyCiGuard(view, path), ...pyInverted(view, path, before)]
          : [...jsSwallowed(view, path), ...jsUnreachable(view, path), ...jsDeadGuard(view, path), ...jsCiGuard(view, path), ...jsInverted(view, path, before)]));
      }
      findings.push(...(python ? pyLibraryNeutralized(view, path) : jsLibraryNeutralized(view, path, fileText)));
    }
  }
  return findings;
}

export const rh015: Verifier = { id: 'RH015', severity: 'error', run };
