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

// --- C++ (Google Test / Catch2 / Boost.Test) ---
// GTEST_SKIP() is Google Test's own runtime-skip macro name — unambiguous, ungated-safe.
const CPP_GTEST_SKIP = /\bGTEST_SKIP\s*\(/;
// Anchored to the TEST/TEST_F/TEST_P macro-call shape so a coincidental DISABLED_ identifier
// elsewhere in the file (e.g. an unrelated helper) is never matched — only the macro's own
// second (test-name) argument.
const CPP_DISABLED_PREFIX = /\bTEST\w*\(\s*\w+\s*,\s*DISABLED_/;
// Catch2 v3+ runtime-skip macro.
const CPP_CATCH2_SKIP = /\bSKIP\s*\(/;
// Catch2's "hide" tag ([.] or [.tagname]) newly added inside a TEST_CASE's tag-string argument.
// Anchored to the TEST_CASE( call so a bare "[.]" substring elsewhere is never matched.
const CPP_CATCH2_HIDE_TAG = /TEST_CASE\([^)]*"\[\.[^"]*\]"/;
// Boost.Test's disabled() decorator — unambiguous namespaced call.
const CPP_BOOST_DISABLED = /boost::unit_test::disabled\s*\(/;

// --- C (Unity / CMocka) ---
// Unity's ungated, unambiguous macro names.
const C_UNITY_IGNORE = /\bTEST_IGNORE(?:_MESSAGE)?\s*\(/;
// CMocka's skip() is a bare, no-argument runtime-skip call, confirmed via api.cmocka.org's own
// cmocka.h API reference (`void skip(void)` / `#define skip() _skip(__FILE__, __LINE__)`,
// documented as "Forces the test to not be executed, but marked as skipped."). Bare `skip` is a
// common enough C identifier/function name that it is gated to a named C test file
// (isCTestFile below) rather than firing ungated, mirroring RESEARCH Pitfall 6's bare-word-token
// precedent (Ruby's skip/pending, R's skip). Check's registration-based model has no equivalent
// skip macro (confirmed via libcheck.github.io's own manual — no skip-related API surfaced) and
// remains a documented gap.
const C_CMOCKA_SKIP = /\bskip\s*\(\s*\)/;

// --- Swift (XCTest / Swift Testing) ---
const SWIFT_XCTSKIP = /\bXCTSkip(?:If|Unless)?\b/;
// Swift Testing's .disabled(...) trait, anchored to a @Test(...) context so a bare `.disabled(`
// elsewhere (e.g. an unrelated Optional/protocol member) is never matched.
const SWIFT_TESTING_DISABLED = /@Test\([^)]*\.disabled\(/;

// --- Dart (package:test) ---
// @Skip(...) is a file-wide annotation, unambiguous.
const DART_SKIP_ANNOTATION = /@Skip\s*\(/;
// skip: named parameter, anchored to a test(/group( call context (quoted description followed
// by a skip: argument on the same line) so an unrelated skip: key elsewhere never matches. Uses
// a bare `.*` (not `[^)]*`) between the description and `skip:` since a realistic single-line
// call commonly contains its own parens (e.g. an arrow-function body: `() => expect(...)`),
// which a `)`-excluding class would wrongly stop at; single-line diff content makes `.*` here
// ReDoS-safe (linear scan to one fixed anchor, mirrors COMMENTED_JS_TEST's existing `.*` use).
const DART_SKIP_PARAM = /\b(?:test|group)\s*\(\s*['"][^'"]*['"]\s*,.*\bskip\s*:/;

// --- Scala (ScalaTest / munit) ---
// munit: test("name".ignore) { ... } — the .ignore) suffix inside a test( call.
const SCALA_MUNIT_IGNORE = /\btest\s*\([^)]*\.ignore\s*\)/;
const SCALA_IGNORESUITE = /@IgnoreSuite\b/;
// ScalaTest FlatSpec/WordSpec bare-word ignore form: a quoted description immediately followed
// by `ignore {`. Bare `ignore` is a common English word/identifier, so this additionally
// requires a named Scala test file (isScalaTestFile below), mirroring Ruby's skip/pending
// precedent (RESEARCH Pitfall 6). Scala's `@Ignore` class-level annotation reuses the existing
// JAVA_KOTLIN_IGNORE token (identical syntax to Java/Kotlin's @Disabled/@Ignore precedent).
const SCALA_FLATSPEC_IGNORE = /"[^"]*"\s+ignore\s*\{/;

// --- Groovy (Spock) ---
// Groovy reuses JAVA_KOTLIN_IGNORE's @Ignore token (spock.lang.Ignore) — no new regex needed,
// only a new switch case/extension. @IgnoreRest and @PendingFeature are Spock-specific.
const GROOVY_IGNOREREST = /@IgnoreRest\b/;
const GROOVY_PENDINGFEATURE = /@PendingFeature\b/;

// --- VB.NET (MSTest / NUnit / xUnit) ---
// VB.NET attributes use angle brackets, NOT C#'s square brackets, and named arguments use `:=`
// not `=` — every C# RH003 regex is bracket/token-anchored and will not match VB.NET source, so
// this is new detection code despite VB.NET's RH002 assertion-level reuse.
const VBNET_IGNORE = /<[^>]*\bIgnore(?:\s*\([^)]*\))?[^>]*>/;
const VBNET_FACT_SKIP = /<[^>]*\bFact\s*\([^)]*\bSkip\s*:=/;

// --- Perl (Test::More / Test::Simple) ---
// SKIP:/TODO: block labels newly added — a bare label immediately followed by an opening brace
// is a distinctive-enough shape (Perl block labels are rare outside loop control), and Perl's
// own .t extension is already a strong test-file signal (prove's own default discovery glob),
// so no additional isPerlTestFile gate is needed per RESEARCH.
const PERL_SKIP_BLOCK = /^\+\s*SKIP\s*:\s*\{/;
const PERL_TODO_BLOCK = /^\+\s*TODO\s*:\s*\{/;

// --- R (testthat) ---
// skip()/skip_if()/skip_if_not()/skip_on_cran()/skip_if_not_installed()/skip_if_offline()/
// skip_on_ci()/skip_on_os() are all covered by one call-shape-anchored regex (skip, optionally
// followed by an underscore-word suffix, followed by an opening paren). Bare `skip`/`skip_if`
// are common enough words/prefixes to collide with unrelated R code outside test files, so this
// is additionally GATED to a named testthat test file (isRTestFile below), mirroring RESEARCH
// Pitfall 6's bare-word-token precedent (Ruby's skip/pending, C's CMocka skip()).
const R_SKIP = /\bskip(?:_\w+)?\s*\(/;

// --- Haskell (Hspec) ---
// x-prefixed forms (xit/xdescribe/xcontext/xspecify) are Hspec-specific, ungated — mirrors the
// JS/Ruby/Kotlin x-prefix precedent exactly.
const HASKELL_X_FORMS = /\bx(?:it|describe|context|specify)\b/;
// pendingWith "reason" / bare `pending` as a spec-item body — common enough English words to
// risk collision outside test files, so GATED to a named Hspec test file (isHaskellTestFile
// below), mirroring RESEARCH Pitfall 6.
const HASKELL_PENDING = /\bpendingWith\b|\bpending\b/;

// --- Elixir (ExUnit) ---
// @tag :skip (per-test) and @moduletag :skip (file-wide — disables every test in the module) are
// both unambiguous Elixir module-attribute-call shapes, ungated-safe.
const ELIXIR_TAG_SKIP = /@tag\s+:skip\b/;
const ELIXIR_MODULETAG_SKIP = /@moduletag\s+:skip\b/;

// --- Lua (busted) ---
// pending("description", function() ... end) used in place of it(...). Bare `pending(` alone is
// a common enough word/function name (e.g. a promise-library "pending" state) to risk collision
// outside spec files, so GATED to a named busted spec file (isLuaTestFile below).
const LUA_PENDING = /\bpending\s*\(/;

// --- Clojure (kaocha) ---
// ^:kaocha/skip metadata newly added to a deftest form — a distinctive, unambiguous metadata
// keyword, the de facto standard modern Clojure test runner's skip mechanism. Ungated. Leiningen's
// arbitrary custom-metadata + project.clj :test-selectors mechanism is deliberately NOT
// implemented (the keyword itself is project-specific/non-standardized, too unreliable to anchor)
// — documented gap per RESEARCH.
const CLOJURE_KAOCHA_SKIP = /\^:kaocha\/skip\b/;

// --- Shell/Bash (bats-core) ---
// `skip` or `skip "reason"` as a bare statement inside a @test "..." { ... } block. Bare `skip`
// is an extremely common English word/identifier, so this is GATED strictly to the .bats
// extension (isBatsFile below) — bats' `skip` shell function is only meaningful inside a .bats
// file's @test block. shunit2's startSkipping/endSkipping is stateful/non-local (a single
// startSkipping call can silently skip every subsequent assertion with no requirement that a
// matching endSkipping appears in the same diff hunk, or even the same file) — a diff-line regex
// cannot reliably determine "is this skip still in effect," so it is NOT implemented; documented
// gap per RESEARCH.
const SHELL_BATS_SKIP = /^\+\s*skip\b(?:\s+["'][^"']*["'])?\s*$/;

// --- Julia (Test stdlib) ---
// @test_skip is an unambiguous macro name, ungated. skip= is anchored to the @test macro-call
// shape (@test ... skip = ...) since `skip=` alone is a generic keyword-argument name that could
// appear in unrelated function calls.
const JULIA_TEST_SKIP = /\@test_skip\b/;
const JULIA_TEST_SKIP_PARAM = /@test\b[^\n]*\bskip\s*=/;

function buildSkipMessage(content: string, ext?: string): string {
  // Ext-first dispatch for languages whose bare-word GROUP B patterns can coincidentally match
  // an unrelated EARLIER language's regex in the generic if-chain below — e.g. Haskell's
  // `xit "desc" $` shape also satisfies Ruby's RUBY_X_FORMS (`\bxit\b\s*["'(]`); Lua's
  // `pending("desc", ...)` also satisfies Haskell's bare HASKELL_PENDING (`\bpending\b`); bats'
  // `skip "reason"` bare statement also satisfies Ruby's RUBY_SKIP_STATEMENT shape. Detection
  // itself is correct in all three cases (isSkipPattern dispatches on `ext`, so the right
  // language's pattern set is consulted) — only the MESSAGE could be misattributed to the wrong
  // language without this ext-first check, since the generic if-chain has no `ext` awareness.
  switch (ext) {
    case 'hs':
      if (HASKELL_X_FORMS.test(content)) return 'Test was disabled with an x-prefixed Hspec form (xit/xdescribe/xcontext/xspecify).';
      if (HASKELL_PENDING.test(content)) return 'Test was marked pending with Hspec pendingWith/pending.';
      break;
    case 'lua':
      if (LUA_PENDING.test(content)) return 'Test was marked pending with busted pending().';
      break;
    case 'bats':
      if (SHELL_BATS_SKIP.test(content)) return 'Test was disabled with a bats skip statement.';
      break;
    default:
      break;
  }
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
  if (CPP_GTEST_SKIP.test(content)) return 'Test was disabled with GTEST_SKIP().';
  if (CPP_DISABLED_PREFIX.test(content)) return 'Test was disabled with a DISABLED_ name prefix.';
  if (CPP_CATCH2_SKIP.test(content)) return 'Test was disabled with Catch2 SKIP().';
  if (CPP_CATCH2_HIDE_TAG.test(content)) return 'Test was hidden with a Catch2 [.] tag.';
  if (CPP_BOOST_DISABLED.test(content)) return 'Test was disabled with a Boost.Test disabled() decorator.';
  if (C_UNITY_IGNORE.test(content)) return 'Test was disabled with Unity TEST_IGNORE.';
  if (C_CMOCKA_SKIP.test(content)) return 'Test was disabled with a CMocka skip() call.';
  if (SWIFT_XCTSKIP.test(content)) return 'Test was disabled with XCTSkip/XCTSkipIf/XCTSkipUnless.';
  if (SWIFT_TESTING_DISABLED.test(content)) return 'Test was disabled with a Swift Testing .disabled trait.';
  if (DART_SKIP_ANNOTATION.test(content)) return 'Test file was disabled with a @Skip annotation.';
  if (DART_SKIP_PARAM.test(content)) return 'Test was disabled with a skip: parameter.';
  if (SCALA_MUNIT_IGNORE.test(content)) return "Test was disabled with munit's .ignore.";
  if (SCALA_IGNORESUITE.test(content)) return 'Suite was disabled with @IgnoreSuite.';
  if (SCALA_FLATSPEC_IGNORE.test(content)) return "Test was disabled with ScalaTest's bare ignore form.";
  if (GROOVY_IGNOREREST.test(content)) return 'Test was disabled with Spock @IgnoreRest.';
  if (GROOVY_PENDINGFEATURE.test(content)) return 'Test was marked pending with Spock @PendingFeature.';
  if (VBNET_IGNORE.test(content)) return 'Test was disabled with a VB.NET <Ignore> attribute.';
  if (VBNET_FACT_SKIP.test(content)) return 'Test was disabled with a VB.NET <Fact(Skip:=...)> attribute.';
  if (PERL_SKIP_BLOCK.test(content)) return 'Test was disabled with a Perl SKIP: block.';
  if (PERL_TODO_BLOCK.test(content)) return 'Test was marked with a Perl TODO: block (a failure now passes the suite).';
  if (R_SKIP.test(content)) return 'Test was disabled with a testthat skip() call.';
  if (HASKELL_X_FORMS.test(content)) return 'Test was disabled with an x-prefixed Hspec form (xit/xdescribe/xcontext/xspecify).';
  if (HASKELL_PENDING.test(content)) return 'Test was marked pending with Hspec pendingWith/pending.';
  if (ELIXIR_MODULETAG_SKIP.test(content)) return 'Every test in this module was disabled with @moduletag :skip.';
  if (ELIXIR_TAG_SKIP.test(content)) return 'Test was disabled with @tag :skip.';
  if (LUA_PENDING.test(content)) return 'Test was marked pending with busted pending().';
  if (CLOJURE_KAOCHA_SKIP.test(content)) return 'Test was disabled with kaocha ^:kaocha/skip metadata.';
  if (SHELL_BATS_SKIP.test(content)) return 'Test was disabled with a bats skip statement.';
  if (JULIA_TEST_SKIP.test(content)) return 'Test was disabled with @test_skip.';
  if (JULIA_TEST_SKIP_PARAM.test(content)) return 'Test was disabled with a skip= keyword argument on @test.';
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

// GROUP A gating tiers (Phase 8.1's systems/Apple/JVM/.NET-family languages).
const CPP_PATTERNS = [CPP_GTEST_SKIP, CPP_DISABLED_PREFIX, CPP_CATCH2_SKIP, CPP_CATCH2_HIDE_TAG, CPP_BOOST_DISABLED];
const C_UNGATED_PATTERNS = [C_UNITY_IGNORE];
// CMocka's bare skip() is gated to a named C test file (see C_CMOCKA_SKIP comment above).
const C_TESTFILE_PATTERNS = [C_CMOCKA_SKIP];
const SWIFT_PATTERNS = [SWIFT_XCTSKIP, SWIFT_TESTING_DISABLED];
const DART_PATTERNS = [DART_SKIP_ANNOTATION, DART_SKIP_PARAM];
const SCALA_UNGATED_PATTERNS = [JAVA_KOTLIN_IGNORE, SCALA_MUNIT_IGNORE, SCALA_IGNORESUITE];
const SCALA_TESTFILE_PATTERNS = [SCALA_FLATSPEC_IGNORE];
const GROOVY_PATTERNS = [JAVA_KOTLIN_IGNORE, GROOVY_IGNOREREST, GROOVY_PENDINGFEATURE];
const VBNET_PATTERNS = [VBNET_IGNORE, VBNET_FACT_SKIP];

// GROUP B gating tiers (Phase 8.1's scripting/functional/dynamic-language family).
const PERL_PATTERNS = [PERL_SKIP_BLOCK, PERL_TODO_BLOCK];
// R's skip()/skip_if() family is gated to a named testthat test file (see R_SKIP comment above).
const R_TESTFILE_PATTERNS = [R_SKIP];
const HASKELL_UNGATED_PATTERNS = [HASKELL_X_FORMS];
// Haskell's pendingWith/pending is gated to a named Hspec test file (see HASKELL_PENDING comment).
const HASKELL_TESTFILE_PATTERNS = [HASKELL_PENDING];
const ELIXIR_PATTERNS = [ELIXIR_TAG_SKIP, ELIXIR_MODULETAG_SKIP];
// Lua's busted pending(...) is gated to a named _spec.lua file (see LUA_PENDING comment above).
const LUA_TESTFILE_PATTERNS = [LUA_PENDING];
const CLOJURE_PATTERNS = [CLOJURE_KAOCHA_SKIP];
// bats' bare skip statement is gated strictly to the .bats extension (see SHELL_BATS_SKIP comment).
const SHELL_BATS_PATTERNS = [SHELL_BATS_SKIP];
const JULIA_PATTERNS = [JULIA_TEST_SKIP, JULIA_TEST_SKIP_PARAM];

const NEW_LANG_EXTS = new Set([
  'go', 'java', 'rs', 'rb', 'php', 'cs', 'kt', 'kts',
  // GROUP A: cpp/cc/cxx/hpp/hxx (C++), c/h (C), swift, dart, scala, groovy, vb. Objective-C
  // (m/mm) is deliberately NOT added here — RH003 is a documented gap for it (see the 'm'/'mm'
  // case in isSkipPattern below), so it stays on the default ctx.isTestFile gate like any other
  // unrecognized extension, with an explicit false short-circuit as a backstop.
  'cpp', 'cc', 'cxx', 'hpp', 'hxx', 'c', 'h', 'swift', 'dart', 'scala', 'groovy', 'vb',
  // GROUP B: pl/pm/t (Perl), r (R), hs (Haskell), ex/exs (Elixir), lua (Lua), clj/cljc (Clojure),
  // sh/bash/bats (Shell), jl (Julia). Perl/R/Haskell/Elixir/Lua/Clojure/Shell/Julia's RH007
  // config-exclusion and RH011 suppression-comment coverage is out of this plan's scope (see
  // 08.1-RESEARCH.md's RH007/RH011 sections) — only RH003 (this plan) and language-detection
  // (08.1-01) are affected by this set.
  'pl', 'pm', 't', 'r', 'hs', 'ex', 'exs', 'lua', 'clj', 'cljc', 'sh', 'bash', 'bats', 'jl',
]);

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
// any file under a src/test/ directory. Slash-runs are collapsed after the backslash swap — see
// isRTestFile's comment for why: a Windows-quoted diff path doubles every backslash, and a naive
// `.replace(/\\/g, '/')` alone turns that into a double-slash `src//test//` that silently fails
// this single-slash-anchored `.includes` check.
function isKotlinTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return /Test\.kt$/.test(base) || normalized.includes('/src/test/');
}

// Ceedling/Unity project-layout convention: *_test.c / test_*.c. CMocka's bare skip() is gated
// to this so an unrelated C function literally named skip() elsewhere is never flagged.
function isCTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return /_test\.c$/.test(base) || /^test_.*\.c$/.test(base);
}

// Mirrors the Scala DEFAULT_GLOBS convention: *Spec.scala/*Suite.scala filename, or any file
// under a src/test/scala/ directory. Gates ScalaTest's bare-word FlatSpec `ignore` form.
// Slash-runs collapsed after the backslash swap, same Windows-doubled-backslash fix as
// isKotlinTestFile/isRTestFile above.
function isScalaTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return /Spec\.scala$/.test(base) || /Suite\.scala$/.test(base) || normalized.includes('/src/test/scala/');
}

// testthat convention: tests/testthat/test-*.R. Gates R_SKIP so an unrelated user-defined
// `skip(...)` function outside a test directory never fires (mirrors isCTestFile's precedent).
// Note: `normalized` collapses runs of 2+ slashes to one after the backslash swap. This guards
// against a real Windows-only diff artifact discovered while wiring this plan's fixtures: git
// quotes absolute Windows paths in a diff header using C-style escaping, doubling every literal
// backslash (`\` becomes `\\` in the header text); `parse-diff` does not un-escape this, so a
// nested path like `...\tests\testthat\test-calculator.R` survives into `Finding.file` as
// `...\\tests\\testthat\\test-calculator.R` (each separator is TWO raw backslash characters, not
// one). A naive `.replace(/\\/g, '/')` turns that into a double-slash `tests//testthat//`, which
// silently fails a single-slash-anchored directory regex like `/tests\/testthat\//` — this bit
// isRTestFile during this plan's own fixture verification (RESEARCH's Windows-path-separator
// pitfall, generalized beyond the RH007 case it originally documented).
function isRTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return /(^|\/)tests\/testthat\//.test(normalized) && /^test-.*\.[Rr]$/.test(base);
}

// hspec-discover convention: *Spec.hs filename, or any file under a test/ directory. Gates
// HASKELL_PENDING so an unrelated `pending` identifier outside test code never fires. See
// isRTestFile's comment above for why slash-runs are collapsed after the backslash swap.
function isHaskellTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return /Spec\.hs$/.test(base) || /(^|\/)test\//.test(normalized);
}

// busted's dominant _spec.lua naming convention. Gates LUA_PENDING so an unrelated `pending(...)`
// function call (e.g. a promise-library state) outside a spec file never fires.
function isLuaTestFile(filePath: string): boolean {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
  return /_spec\.lua$/.test(base);
}

// bats-core only executes .bats files (tool-enforced) — the cleanest test-file signal in this
// batch after Perl's .t. Gates SHELL_BATS_SKIP so a bare `skip` word in an ordinary .sh/.bash
// script never fires.
function isBatsFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.bats');
}

function isSkipPattern(content: string, flags: {
  ext: string | undefined;
  pyTestModule: boolean;
  goTestFile: boolean;
  rubyTestFile: boolean;
  kotlinTestFile: boolean;
  cTestFile: boolean;
  scalaTestFile: boolean;
  rTestFile: boolean;
  haskellTestFile: boolean;
  luaTestFile: boolean;
  batsFile: boolean;
}): boolean {
  const {
    ext, pyTestModule, goTestFile, rubyTestFile, kotlinTestFile, cTestFile, scalaTestFile,
    rTestFile, haskellTestFile, luaTestFile, batsFile,
  } = flags;
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
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hxx':
      return CPP_PATTERNS.some(re => re.test(content));
    case 'c':
    case 'h':
      if (C_UNGATED_PATTERNS.some(re => re.test(content))) return true;
      return cTestFile && C_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'swift':
      return SWIFT_PATTERNS.some(re => re.test(content));
    case 'm':
    case 'mm':
      // Objective-C: no confirmed, callable XCTest skip API found this session. Apple's own
      // documentation JSON (developer.apple.com/tutorials/data/documentation/xctest/xctskip.json
      // etc.) shows XCTSkip/XCTSkipIf/XCTSkipUnless carry only a "swift" interfaceLanguage
      // variant — no "occ" (Objective-C) variant — verified against XCTestCase, which IS
      // available in both languages and correctly shows both variants. Documented gap per
      // RESEARCH Open Question 1: never a guessed detector.
      return false;
    case 'dart':
      return DART_PATTERNS.some(re => re.test(content));
    case 'scala':
      if (SCALA_UNGATED_PATTERNS.some(re => re.test(content))) return true;
      return scalaTestFile && SCALA_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'groovy':
      return GROOVY_PATTERNS.some(re => re.test(content));
    case 'vb':
      return VBNET_PATTERNS.some(re => re.test(content));
    case 'pl':
    case 'pm':
    case 't':
      return PERL_PATTERNS.some(re => re.test(content));
    case 'r':
      return rTestFile && R_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'hs':
      if (HASKELL_UNGATED_PATTERNS.some(re => re.test(content))) return true;
      return haskellTestFile && HASKELL_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'ex':
    case 'exs':
      return ELIXIR_PATTERNS.some(re => re.test(content));
    case 'lua':
      return luaTestFile && LUA_TESTFILE_PATTERNS.some(re => re.test(content));
    case 'clj':
    case 'cljc':
      return CLOJURE_PATTERNS.some(re => re.test(content));
    case 'sh':
    case 'bash':
      // shunit2's startSkipping/endSkipping is a documented gap (stateful, non-local — see
      // SHELL_BATS_SKIP comment above); no bare-word pattern is safe to apply outside a named
      // .bats file, so plain .sh/.bash files never fire.
      return false;
    case 'bats':
      return batsFile && SHELL_BATS_PATTERNS.some(re => re.test(content));
    case 'jl':
      return JULIA_PATTERNS.some(re => re.test(content));
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
    const cTestFile = (ext === 'c' || ext === 'h') && isCTestFile(filePath);
    const scalaTestFile = ext === 'scala' && isScalaTestFile(filePath);
    const rTestFile = ext === 'r' && isRTestFile(filePath);
    const haskellTestFile = ext === 'hs' && isHaskellTestFile(filePath);
    const luaTestFile = ext === 'lua' && isLuaTestFile(filePath);
    const batsFile = ext === 'bats' && isBatsFile(filePath);
    // For JS/TS files, only inspect test files — prevents false positives from library
    // code that uses .skip() or .only() as unrelated method names (e.g. RxJS observable.skip(5)).
    // Python and the new languages pass through: each handles its own gating internally
    // (named-test-file tiers or ungated-safe attribute anchors) inside isSkipPattern.
    if (!isPython && !isNewLang && !ctx.isTestFile(filePath)) continue;
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (!isSkipPattern(change.content, {
          ext, pyTestModule, goTestFile, rubyTestFile, kotlinTestFile, cTestFile, scalaTestFile,
          rTestFile, haskellTestFile, luaTestFile, batsFile,
        })) continue;
        findings.push({
          verifierId: 'RH003',
          severity: 'error',
          file: filePath,
          line: change.ln,
          message: buildSkipMessage(change.content, ext),
          suggestion: buildSuggestion(change.content),
        });
      }
    }
  }

  return findings;
}

export const rh003: Verifier = { id: 'RH003', severity: 'error', run };
