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
// @pytest.mark.xfail marks a test as an expected failure, so a currently-failing test decorated
// with it turns the suite green — the same evasion as a skip.
const PYTEST_XFAIL = /@pytest\.mark\.xfail\b/;
// Module-level `pytestmark = pytest.mark.skip/skipif/xfail` disables every test in the file.
const PYTESTMARK = /\bpytestmark\s*=\s*pytest\.mark\.(?:skip|skipif|xfail)\b/;
// `__test__ = False` on a class/module tells the collector to skip everything under it.
const DUNDER_TEST_FALSE = /^\+\s*__test__\s*=\s*False\b/;
const UNITTEST_SKIP = /@unittest\.skip(?:Unless)?\b/;
const BARE_SKIP = /^\+\s*@skip\b/;
// Imperative skips that disable at runtime without a decorator. `.skipTest(` is anchored to a
// self/cls receiver so it reads as the unittest method, not an arbitrary `.skipTest(` call.
const PY_IMPERATIVE_SKIP = /\bpytest\.skip\s*\(|\bself\.skipTest\s*\(|\b(?:unittest\.)?SkipTest\b/;
const COMMENTED_PY_TEST = /^\+\s*#.*(?:async\s+)?def test_/;
// Commenting a test out disables it exactly like .skip does. Requires the quote after the
// paren (a test-declaration shape) so prose like `// test(x) is slow` doesn't match.
const COMMENTED_JS_TEST = /^\+\s*\/\/.*\b(?:it|test|describe)(?:\.\w+)?\s*\(\s*['"`]/;

// --- Go (stdlib testing) ---
// t.Skip()/t.Skipf()/t.SkipNow() is idiomatic for legitimate conditional skips (e.g. `if
// testing.Short() { t.Skip(...) }`), so it is only flagged inside a named _test.go file
// (isGoTestFile below), mirroring the Python imperative-skip precedent (PY_IMPERATIVE_SKIP).
const GO_SKIP = /\bt\.Skip(?:f|Now)?\s*\(/;
const GO_BENCH_SKIP = /\bb\.Skip(?:f|Now)?\s*\(/;

// --- Java / Kotlin (JUnit5 / JUnit4 / kotlin.test) ---
// Attribute-anchored, unambiguous — safe to flag on any changed .java/.kt file (no other Java
// or Kotlin construct looks like this).
const JAVA_KOTLIN_DISABLED = /@Disabled\b/;
const JAVA_KOTLIN_IGNORE = /@Ignore\b/;

// --- Rust ---
// #[ignore] is only legal on a #[test]-annotated item (compiler-enforced) — ungated-safe
// across every .rs file. Do NOT gate this on isTestFile (RESEARCH Pitfall 1): Rust's idiomatic
// #[cfg(test)] mod tests lives inline in ordinary source files, not a dedicated test file.
const RUST_IGNORE = /#\[\s*ignore(?:\s*=\s*["'][^"']*["'])?\s*\]/;

// --- Ruby (RSpec / Minitest) ---
// x-prefixed forms are call-shape anchored (require a following paren or quoted arg), so they
// are low collision risk, but still gated to a named spec/test file below (isRubyTestFile) —
// bare `skip`/`pending` are common English words used as ordinary identifiers elsewhere in
// Ruby, so they additionally require a DSL call shape (RESEARCH Pitfall 3).
const RUBY_X_FORMS = /\bx(?:it|describe|context|example)\b\s*["'(]/;
// `skip "reason"` / `pending` / `pending("reason")` as a standalone statement (not an
// assignment — `skip = compute_skip(n)` does not match since it requires end-of-line
// immediately after an optional quoted argument).
const RUBY_SKIP_STATEMENT = /^\+\s*(?:skip|pending)\b\s*(?:\(?\s*["'][^"']*["']\s*\)?)?\s*$/;
// `it "...", skip: true` / `example "...", pending: true` inline-option shape.
const RUBY_SKIP_OPTION = /\b(?:it|example)\s*\(?\s*["'][^"']*["']\s*,\s*(?:skip|pending)\s*:/;

// --- Kotlin (Kotest) ---
// Same x-prefixed idiom as Ruby/Jasmine/Mocha; gated to a named Kotlin test file
// (isKotlinTestFile). `enabled = false` is deliberately NOT implemented — too generic a token
// (also a normal Kotlin property name in unrelated config) per RESEARCH.
const KOTLIN_X_FORMS = /\bx(?:describe|it|context)\s*\(/;

// --- PHP (PHPUnit) ---
// Method-name anchored on `$this->`, unambiguous — ungated-safe on any changed .php file.
const PHP_MARK_SKIPPED = /\$this->markTestSkipped\s*\(/;
const PHP_MARK_INCOMPLETE = /\$this->markTestIncomplete\s*\(/;

// --- C# (xUnit / NUnit / MSTest) ---
// Bracket-attribute anchored, unambiguous — ungated-safe on any changed .cs file.
const CSHARP_FACT_SKIP = /\[(?:Fact|Theory)\s*\([^)]*Skip\s*=/;
const CSHARP_IGNORE = /\[Ignore(?:\s*\([^)]*\))?\]/;

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
  if (PYTEST_XFAIL.test(content)) return 'Test was marked @pytest.mark.xfail (a failure now passes the suite).';
  if (PYTESTMARK.test(content)) return 'Module-level pytestmark disables every test in this file.';
  if (DUNDER_TEST_FALSE.test(content)) return 'Test collection disabled with __test__ = False.';
  if (UNITTEST_SKIP.test(content)) return 'Test was disabled with @unittest.skip.';
  if (BARE_SKIP.test(content)) return 'Test was disabled with @skip.';
  if (PY_IMPERATIVE_SKIP.test(content)) return 'Test was disabled with an imperative skip (pytest.skip/skipTest/SkipTest).';
  if (COMMENTED_PY_TEST.test(content)) return 'Test function was commented out.';
  if (COMMENTED_JS_TEST.test(content)) return 'Test was commented out.';
  if (GO_BENCH_SKIP.test(content)) return 'Benchmark was disabled with b.Skip.';
  if (GO_SKIP.test(content)) return 'Test was disabled with t.Skip.';
  if (JAVA_KOTLIN_DISABLED.test(content)) return 'Test was disabled with @Disabled.';
  if (JAVA_KOTLIN_IGNORE.test(content)) return 'Test was disabled with an @Ignore annotation.';
  if (RUST_IGNORE.test(content)) return 'Test was disabled with #[ignore].';
  if (RUBY_X_FORMS.test(content)) return 'Test was disabled with an x-prefixed RSpec form (xit/xdescribe/xcontext/xexample).';
  if (RUBY_SKIP_OPTION.test(content) || RUBY_SKIP_STATEMENT.test(content)) {
    return /\bpending\b/.test(content) ? 'Test was marked pending (a failure now passes the suite).' : 'Test was disabled with skip.';
  }
  if (KOTLIN_X_FORMS.test(content)) return 'Test was disabled with an x-prefixed Kotest form.';
  if (PHP_MARK_SKIPPED.test(content)) return 'Test was disabled with $this->markTestSkipped().';
  if (PHP_MARK_INCOMPLETE.test(content)) return 'Test was marked incomplete with $this->markTestIncomplete().';
  if (CSHARP_FACT_SKIP.test(content)) return 'Test was disabled with [Fact(Skip = ...)].';
  if (CSHARP_IGNORE.test(content)) return 'Test was disabled with an Ignore attribute.';
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
// Decorator/module-level Python disables: unambiguous and safe to flag on any changed .py file.
const PY_DECORATOR_PATTERNS = [PYTEST_SKIP, PYTEST_SKIPIF, PYTEST_XFAIL, PYTESTMARK, DUNDER_TEST_FALSE, UNITTEST_SKIP, BARE_SKIP, COMMENTED_PY_TEST];
// Imperative runtime skips (`pytest.skip(...)`, `self.skipTest(...)`) are legitimate in fixtures
// and conftest.py (e.g. an env-conditional skip), so they only count inside a named test module.
const PY_TESTFILE_PATTERNS = [PY_IMPERATIVE_SKIP];

// Ungated-safe tiers for the 7 new languages: each token is attribute/keyword/symbol-anchored
// (per-language syntax with no other legal meaning), so these fire on any changed file of that
// language, mirroring PY_DECORATOR_PATTERNS rather than PY_TESTFILE_PATTERNS.
const JAVA_PATTERNS = [JAVA_KOTLIN_DISABLED, JAVA_KOTLIN_IGNORE];
const RUST_PATTERNS = [RUST_IGNORE];
const PHP_PATTERNS = [PHP_MARK_SKIPPED, PHP_MARK_INCOMPLETE];
const CSHARP_PATTERNS = [CSHARP_FACT_SKIP, CSHARP_IGNORE];
// Kotlin shares Java/kotlin.test's @Disabled/@Ignore tokens (ungated) plus its own Kotest
// x-forms, which are gated to a named Kotlin test file (isKotlinTestFile below).
const KOTLIN_UNGATED_PATTERNS = [JAVA_KOTLIN_DISABLED, JAVA_KOTLIN_IGNORE];
const KOTLIN_TESTFILE_PATTERNS = [KOTLIN_X_FORMS];
// Go: t.Skip/b.Skip are only flagged inside a named _test.go file (see GO_SKIP comment above).
const GO_PATTERNS = [GO_SKIP, GO_BENCH_SKIP];

const NEW_LANG_EXTS = new Set(['go', 'java', 'rs', 'rb', 'php', 'cs', 'kt', 'kts']);

// A named pytest/unittest test module (test_x.py / x_test.py), excluding conftest.py and other
// setup files where an imperative skip is normal.
function isPyTestModule(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? filePath;
  const named = /^test_.*\.py$/.test(base) || /_test\.py$/.test(base);
  return named && base !== 'conftest.py';
}

// Go test code can ONLY live in _test.go files (compiler-enforced) — no conftest.py-style
// exception is needed, unlike isPyTestModule.
function isGoTestFile(filePath: string): boolean {
  return filePath.endsWith('_test.go');
}

// RSpec/Minitest convention. Bare `skip`/`pending` and the x-forms are both gated to this so a
// same-named identifier in ordinary Ruby source never fires (RESEARCH Pitfall 3).
function isRubyTestFile(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? filePath;
  return /_spec\.rb$/.test(base) || /_test\.rb$/.test(base);
}

// Mirrors the Kotlin DEFAULT_GLOBS convention (Java/Gradle/Maven-shared): *Test.kt filename, or
// any file under a src/test/ directory.
function isKotlinTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return /Test\.kt$/.test(base) || normalized.includes('/src/test/');
}

function isSkipPattern(content: string, flags: {
  ext: string | undefined;
  pyTestModule: boolean;
  goTestFile: boolean;
  rubyTestFile: boolean;
  kotlinTestFile: boolean;
}): boolean {
  const { ext, pyTestModule, goTestFile, rubyTestFile, kotlinTestFile } = flags;
  switch (ext) {
    case 'py':
      if (PY_DECORATOR_PATTERNS.some(re => re.test(content))) return true;
      return pyTestModule && PY_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'go':
      return goTestFile && GO_PATTERNS.some(re => re.test(content));
    case 'java':
      return JAVA_PATTERNS.some(re => re.test(content));
    case 'kt':
    case 'kts':
      if (KOTLIN_UNGATED_PATTERNS.some(re => re.test(content))) return true;
      return kotlinTestFile && KOTLIN_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'rs':
      return RUST_PATTERNS.some(re => re.test(content));
    case 'rb':
      if (!rubyTestFile) return false;
      return RUBY_X_FORMS.test(content) || RUBY_SKIP_STATEMENT.test(content) || RUBY_SKIP_OPTION.test(content);
    case 'php':
      return PHP_PATTERNS.some(re => re.test(content));
    case 'cs':
      return CSHARP_PATTERNS.some(re => re.test(content));
    default:
      return JS_PATTERNS.some(re => re.test(content));
  }
}

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    const ext = filePath.split('.').pop()?.toLowerCase();
    const isPython = ext === 'py';
    const pyTestModule = isPython && isPyTestModule(filePath);
    const isNewLang = ext !== undefined && NEW_LANG_EXTS.has(ext);
    const goTestFile = ext === 'go' && isGoTestFile(filePath);
    const rubyTestFile = ext === 'rb' && isRubyTestFile(filePath);
    const kotlinTestFile = (ext === 'kt' || ext === 'kts') && isKotlinTestFile(filePath);
    // For JS/TS files, only inspect test files — prevents false positives from library
    // code that uses .skip() or .only() as unrelated method names (e.g. RxJS observable.skip(5)).
    // Python and the 7 new languages pass through: each handles its own gating internally
    // (named-test-file tiers or ungated-safe attribute anchors) inside isSkipPattern.
    if (!isPython && !isNewLang && !ctx.isTestFile(filePath)) continue;
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (!isSkipPattern(change.content, { ext, pyTestModule, goTestFile, rubyTestFile, kotlinTestFile })) continue;
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
