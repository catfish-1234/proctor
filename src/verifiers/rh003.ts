import type { Context, Finding, Verifier } from '../types.js';

// Anchored to a test-declaration root (it/test/describe) so a query-builder `.skip(10)` or an
// observable `.only` on a domain object is NOT flagged. `(?:\.\w+)*` allows chained modifiers
// like `it.skip.each(...)` / `describe.only.each(...)` / `test.concurrent.skip(...)`.
const SKIP_ONLY = /\b(?:it|test|describe)(?:\.\w+)*\.(?:skip|only)\b/;
// `it.todo`/`test.todo` marks a test that never runs. Keyword-anchored so `list.todo('x')` on a
// domain object doesn't match.
const TODO_RE = /\b(?:it|test)\.todo\b/;
const XIT = /\bxit\s*\(/;
const XDESCRIBE = /\bxdescribe\s*\(/;
// Jest/jasmine aliases: xtest = test.skip; fit/fdescribe focus one case and silently skip the rest.
// Bare globals only — `(?<![.\w])` prevents matching member calls like `model.fit(...)` (scikit-
// learn/Keras) or `obj.xtest(...)`.
const FOCUS_ALIAS = /(?<![.\w])(?:xtest|fit|fdescribe)\s*\(/;
// Bracket notation: it['skip'](...) / test["only"](...) reaches the same modifier past the regex.
const BRACKET_SKIP = /\b(?:it|test|describe)\s*\[\s*['"`](?:skip|only)['"`]\s*\]/;
const PYTEST_SKIP = /@pytest\.mark\.skip/;
const PYTEST_SKIPIF = /@pytest\.mark\.skipif\b/;
const UNITTEST_SKIP = /@unittest\.skip(?:Unless)?\b/;
const BARE_SKIP = /^\+\s*@skip\b/;
// Imperative skips that disable at runtime without a decorator. `.skipTest(` is anchored to a
// self/cls receiver so it reads as the unittest method, not an arbitrary `.skipTest(` call.
const PY_IMPERATIVE_SKIP = /\bpytest\.skip\s*\(|\bself\.skipTest\s*\(|\b(?:unittest\.)?SkipTest\b/;
const COMMENTED_PY_TEST = /^\+\s*#.*def test_/;
// Commenting a test out disables it exactly like .skip does. Requires the quote after the
// paren (a test-declaration shape) so prose like `// test(x) is slow` doesn't match.
const COMMENTED_JS_TEST = /^\+\s*\/\/.*\b(?:it|test|describe)(?:\.\w+)?\s*\(\s*['"`]/;

function buildSkipMessage(content: string): string {
  const m = content.match(/\b(?:it|test|describe)(?:\.\w+)*\.(skip|only|todo)\s*[.(]?\s*['"`](.*?)['"`]/);
  if (m && m[2]) return `Test '${m[2]}' was disabled with .${m[1]}.`;
  if (SKIP_ONLY.test(content)) return 'Test was disabled with a .skip/.only modifier.';
  if (TODO_RE.test(content)) return 'Test was marked .todo (its body never runs).';
  if (XIT.test(content)) return 'Test was disabled with xit.';
  if (XDESCRIBE.test(content)) return 'Suite was disabled with xdescribe.';
  if (FOCUS_ALIAS.test(content)) return 'Test was disabled or focused with xtest/fit/fdescribe.';
  if (BRACKET_SKIP.test(content)) return 'Test was disabled with a bracket-notation skip/only.';
  if (PYTEST_SKIP.test(content)) return 'Test was disabled with @pytest.mark.skip.';
  if (PYTEST_SKIPIF.test(content)) return 'Test was conditionally disabled with @pytest.mark.skipif.';
  if (UNITTEST_SKIP.test(content)) return 'Test was disabled with @unittest.skip.';
  if (BARE_SKIP.test(content)) return 'Test was disabled with @skip.';
  if (PY_IMPERATIVE_SKIP.test(content)) return 'Test was disabled with an imperative skip (pytest.skip/skipTest/SkipTest).';
  if (COMMENTED_PY_TEST.test(content)) return 'Test function was commented out.';
  if (COMMENTED_JS_TEST.test(content)) return 'Test was commented out.';
  return 'Test was disabled.';
}

function buildSuggestion(content: string): string {
  if (/\.skip\s*[.(]/.test(content)) return 'Remove .skip and fix the underlying test failure.';
  if (/\.only\s*[.(]/.test(content)) return 'Remove .only to run the full test suite.';
  return 'Re-enable the disabled test and fix the underlying failure.';
}

// Language-scoped so JS constructs (fit/xtest/it.skip) never run against Python code and Python
// constructs (pytest.skip/SkipTest) never run against JS — cross-language matches were pure noise.
const JS_PATTERNS = [SKIP_ONLY, TODO_RE, XIT, XDESCRIBE, FOCUS_ALIAS, BRACKET_SKIP, COMMENTED_JS_TEST];
const PY_PATTERNS = [PYTEST_SKIP, PYTEST_SKIPIF, UNITTEST_SKIP, BARE_SKIP, PY_IMPERATIVE_SKIP, COMMENTED_PY_TEST];

function isSkipPattern(content: string, isPython: boolean): boolean {
  const patterns = isPython ? PY_PATTERNS : JS_PATTERNS;
  return patterns.some(re => re.test(content));
}

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    const ext = filePath.split('.').pop()?.toLowerCase();
    const isPython = ext === 'py';
    // For JS/TS files, only inspect test files — prevents false positives from library
    // code that uses .skip() or .only() as unrelated method names (e.g. RxJS observable.skip(5)).
    // Python files pass through: their decorator/imperative patterns are already specific enough.
    if (!isPython && !ctx.isTestFile(filePath)) continue;
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (!isSkipPattern(change.content, isPython)) continue;
        findings.push({
          verifierId: 'RH003',
          severity: 'error',
          file: filePath,
          line: change.ln,
          message: buildSkipMessage(change.content),
          suggestion: buildSuggestion(change.content),
        });
      }
    }
  }

  return findings;
}

export const rh003: Verifier = { id: 'RH003', severity: 'error', run };
