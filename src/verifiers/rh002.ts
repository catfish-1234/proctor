import type { Context, Finding, Verifier } from '../types.js';

// Strong assertion patterns (specific value assertions)
const STRONG_PATTERNS = [
  /\.toBe\([^)]+\)/,
  /\.toStrictEqual\(/,
  /\.toThrow\(['"`]/,
  /\.toEqual\([^)]+\)/,
  /assertEqual\(.*,.*\)/,
  /assertIn\(/,
  /assertRaises\(/,
  /assert\s+.+\s*==\s*.+/,
  // Go (testify)
  /\bassert\.Equal\(/,
  /\brequire\.Equal\(/,
  // Java / Kotlin (kotlin.test) — bare `assertEquals(...)`, JUnit-style
  /\bassertEquals\(/,
  // PHP (PHPUnit) — anchored to an instance/static receiver since assertEquals/assertSame are
  // TestCase methods, never bare top-level calls; the receiver disambiguates the generic token
  /(?:->|::)\s*assertEquals\(/,
  /(?:->|::)\s*assertSame\(/,
  // C# (xUnit / NUnit / MSTest)
  /\bAssert\.Equal\(/,
  /\bAssert\.AreEqual\(/,
  // Kotlin (Kotest infix matcher) — `x shouldBe y`, excluding `shouldBe null` (that's the weak form)
  /\bshouldBe\s+(?!null\b)/,
  // GROUP A (LANG-11) — C++ Google Test
  /\b(?:EXPECT|ASSERT)_EQ\s*\(/,
  // GROUP A — C++ Boost.Test (MEDIUM confidence, training-knowledge — RESEARCH A6)
  /\bBOOST_(?:CHECK|REQUIRE)_EQUAL\s*\(/,
  // GROUP A — C Unity
  /\bTEST_ASSERT_EQUAL(?:_INT|_STRING)?\s*\(/,
  // GROUP A — C CMocka (MEDIUM confidence — RESEARCH A7)
  /\bassert_(?:int|string|memory)_equal\s*\(/,
  // GROUP A — C Check (MEDIUM confidence — RESEARCH A7)
  /\bck_assert_(?:int|str)_eq\s*\(/,
  // GROUP A — Swift + Objective-C shared XCTest (one extension-agnostic pair, fires on .swift
  // and .m/.mm alike)
  /\bXCTAssertEqual(?:Objects)?\s*\(/,
  // GROUP B (LANG-11) — Perl Test::More
  /\bis(?:_deeply)?\s*\(/,
  // GROUP B — R testthat
  /\bexpect_(?:equal|identical)\s*\(/,
  // GROUP B — Lua busted
  /\bassert\.(?:are\.equal|equals)\s*\(/,
  // GROUP B — Shell/Bash bats-assert (flat pair only; native `[ ]` same-subject form is a
  // documented gap, see RESEARCH — bare `[ ]` test syntax is pervasive in ordinary shell control
  // flow and carries high false-positive risk)
  /\bassert_equal\b/,
];

// Unconditionally-weak matchers: these assert almost nothing regardless of context, so replacing
// any removed strong assertion in the same chunk with one is a weakening.
const WEAK_PATTERNS = [
  /\.toBeDefined\(\)/,
  /\.toBeTruthy\(\)/,
  /\.toBeNull\(\)/,
  /\.toEqual\(\)/,
  /\.toThrow\(\)(?!\s*['"`(])/,
  /assertTrue\(/,
  /assert True/,
  /^\+\s*pass\s*$/,
  // Go (testify)
  /\bassert\.NotNil\(/,
  /\bassert\.True\(/,
  /\bassert\.NotEmpty\(/,
  // Java / Kotlin (kotlin.test) — bare `assertNotNull(...)`; also matches PHP's
  // `$this->assertNotNull(...)`/`self::assertNotNull(...)` since `\b` holds at a `->`/`::` boundary
  /\bassertNotNull\(/,
  // C# (xUnit / NUnit / MSTest)
  /\bAssert\.NotNull\(/,
  /\bAssert\.IsNotNull\(/,
  // Kotlin (Kotest infix matcher)
  /\bshouldNotBe\s+null\b/,
  // GROUP A (LANG-11) — C++ Google Test
  /\b(?:EXPECT|ASSERT)_TRUE\s*\(/,
  /\bEXPECT_NE\s*\([^,]*,\s*nullptr\)/,
  // GROUP A — C++ Boost.Test (MEDIUM confidence — RESEARCH A6)
  /\bBOOST_(?:CHECK|WARN)\s*\(/,
  // GROUP A — C Unity
  /\bTEST_ASSERT(?:_TRUE|_NOT_NULL)?\s*\(/,
  // GROUP A — C CMocka (MEDIUM confidence — RESEARCH A7)
  /\bassert_non_null\s*\(/,
  /\bassert_true\s*\(/,
  // GROUP A — C Check (MEDIUM confidence — RESEARCH A7)
  /\bck_assert\s*\(/,
  /\bck_assert_ptr_nonnull\s*\(/,
  // GROUP A — Swift + Objective-C shared XCTest (one extension-agnostic pair)
  /\bXCTAssert(?:NotNil|True)\s*\(/,
  // GROUP B (LANG-11) — Perl Test::More
  /\bok\s*\(/,
  // GROUP B — R testthat
  /\bexpect_(?:true|type)\s*\(/,
  // GROUP B — Lua busted
  /\bassert\.(?:is_truthy|is_not_nil)\s*\(/,
  // GROUP B — Shell/Bash bats-assert
  /\bassert_success\b/,
  /\bassert_not_equal\b/,
];

// Contextually-weak matchers. Ordering comparisons (toBeGreaterThan(0)) and a whole-argument
// expect.anything() are LEGITIMATE on their own (positive counts, non-deterministic fields), so
// they only count as a weakening when they replace a strong assertion on the SAME subject
// (e.g. `expect(x).toBe(42)` -> `expect(x).toBeGreaterThan(0)`). A nested `expect.any(String)`
// inside an object is a normal idiom and is deliberately NOT treated as weak.
const ORDERING_WEAK = /\.toBe(?:GreaterThan|LessThan)(?:OrEqual)?\(/;
const SOLE_ANYTHING = /\.(?:toBe|toEqual|toStrictEqual)\(\s*expect\.anything\(\)\s*\)/;

function isStrongAssertion(content: string): boolean {
  // `.toEqual(expect.anything())` matches a STRONG shape but asserts nothing — exclude it.
  if (SOLE_ANYTHING.test(content)) return false;
  return STRONG_PATTERNS.some(p => p.test(content));
}

function isWeakAssertion(content: string): boolean {
  return WEAK_PATTERNS.some(p => p.test(content));
}

function isContextualWeak(content: string): boolean {
  return ORDERING_WEAK.test(content) || SOLE_ANYTHING.test(content);
}

/**
 * The subject of an `expect(<subject>).matcher(...)` assertion, whitespace-normalized, or null.
 * The balanced-parens capture `(?:[^()]|\([^()]*\))*` handles one level of nesting (`expect(foo(x))`)
 * and is ReDoS-safe — every alternative consumes at least one char with no ambiguity, so a long
 * whitespace run inside expect(...) can't cause catastrophic backtracking.
 */
function extractSubject(content: string): string | null {
  const m = content.match(/expect\(((?:[^()]|\([^()]*\))*)\)\s*\./);
  return m ? m[1]!.replace(/\s+/g, '') : null;
}

// Python assertAlmostEqual pattern — matches tolerance-widening when places= value is reduced
const ALMOST_EQUAL = /assertAlmostEqual\(/;

// GROUP A (LANG-11) macro/matcher-call label shape, balanced-parens capture (mirrors
// extractSubject/rustMacro): Google Test (EXPECT_EQ/ASSERT_TRUE/EXPECT_NE), Boost.Test
// (BOOST_CHECK_EQUAL), Unity (TEST_ASSERT_EQUAL), Check (ck_assert_int_eq), XCTest
// (XCTAssertEqual, shared by Swift/Objective-C).
const GROUP_A_MACRO_CALL_RE =
  /\b((?:EXPECT|ASSERT)_(?:EQ|TRUE|NE)\s*\((?:[^()]|\([^()]*\))*\)|BOOST_(?:CHECK|REQUIRE|WARN)(?:_EQUAL)?\s*\((?:[^()]|\([^()]*\))*\)|TEST_ASSERT\w*\s*\((?:[^()]|\([^()]*\))*\)|ck_assert\w*\s*\((?:[^()]|\([^()]*\))*\)|XCTAssert\w*\s*\((?:[^()]|\([^()]*\))*\))/;

// GROUP B (LANG-11) macro/matcher-call label shape, balanced-parens capture (mirrors
// GROUP_A_MACRO_CALL_RE): Perl Test::More (is/is_deeply/ok), R testthat (expect_equal/
// expect_identical/expect_true/expect_type), Lua busted (assert.are.equal/assert.equals/
// assert.is_truthy/assert.is_not_nil).
const GROUP_B_MACRO_CALL_RE =
  /\b(is(?:_deeply)?\s*\((?:[^()]|\([^()]*\))*\)|ok\s*\((?:[^()]|\([^()]*\))*\)|expect_(?:equal|identical|true|type)\s*\((?:[^()]|\([^()]*\))*\)|assert\.(?:are\.equal|equals|is_truthy|is_not_nil)\s*\((?:[^()]|\([^()]*\))*\))/;

// GROUP B — Shell/Bash bats-assert: no parens, space-separated CLI-style arguments
// (assert_equal "$a" "$b" / assert_success / assert_not_equal ...).
const BATS_ASSERT_CALL_RE = /\bassert_(?:equal|success|not_equal)\b[^\n]*/;

/** Extract a short label like 'toBe(3)' or 'toBeDefined()' from a diff line. */
function extractLabel(content: string): string {
  // Try to match a method call like .toXxx(...) or assertEqual(...)
  const methodCall = content.match(/\.(to\w+\([^)]*\))/);
  if (methodCall) return methodCall[1] ?? '';
  // AssertJ fluent chain: assertThat(x).isEqualTo(3) / assertThat(x).isNotNull() — matched BEFORE
  // the generic assertCall pattern below, which would otherwise truncate the label at the first
  // `)` and lose the distinguishing trailing matcher (`assertThat(x)` for both strong and weak).
  const assertThatChain = content.match(/(assertThat\([^)]*\)\.\w+\([^)]*\))/);
  if (assertThatChain) return assertThatChain[1] ?? '';
  // GROUP A (LANG-11) macro/matcher calls: Google Test, Boost.Test, Unity, Check (ck_assert*
  // doesn't start with lowercase "assert" as its own word, so the generic assertCall pattern
  // below would silently drop its "ck_" prefix), XCTest (shared Swift/Objective-C). Balanced-
  // parens capture mirrors the rustMacro/extractSubject shape below. Tried BEFORE assertCall so
  // the full macro name is preserved in the label.
  const groupAMacroCall = content.match(GROUP_A_MACRO_CALL_RE);
  if (groupAMacroCall) return groupAMacroCall[1] ?? '';
  // Clojure: (is (= SUBJECT EXPECTED)) / (is (some? SUBJECT)) / bare (is SUBJECT) — procedural
  // paren-depth extraction (NOT a balanced-parens regex), since nesting can exceed the one level
  // GROUP_A_MACRO_CALL_RE/GROUP_B_MACRO_CALL_RE handle (e.g. `(is (= (add 2 3) 5))`). Tried
  // BEFORE GROUP_B_MACRO_CALL_RE: Perl's `\bis\s*\(` alternative would otherwise also match
  // Clojure's "is (" (the "is" token followed by whitespace then the `(=...)` group's opening
  // paren), silently truncating away the outer `(is ...)` wrapper — exactly the truncation risk
  // the plan calls out for Clojure's S-expression label extraction.
  const clojureIsLabel = extractClojureIsLabel(content);
  if (clojureIsLabel) return clojureIsLabel;
  // GROUP B (LANG-11) macro/matcher calls: Perl Test::More, R testthat, Lua busted. Tried BEFORE
  // the generic assertCall pattern below for the same truncation-avoidance reason as GROUP A.
  const groupBMacroCall = content.match(GROUP_B_MACRO_CALL_RE);
  if (groupBMacroCall) return groupBMacroCall[1] ?? '';
  // Shell/Bash bats-assert: assert_equal/assert_success/assert_not_equal (no parens).
  const batsAssertCall = content.match(BATS_ASSERT_CALL_RE);
  if (batsAssertCall) return batsAssertCall[0].trim();
  // Haskell: LHS `shouldBe`/`shouldSatisfy`/`shouldNotBe` RHS backtick-infix operator forms. The
  // trailing operand is captured to end-of-line (`.+`), not a single-token class, since RHS
  // operands like `Just 2` are themselves multi-token expressions.
  const haskellBacktickCall = content.match(/([\w.'()]+\s*`(?:shouldBe|shouldSatisfy|shouldNotBe)`\s*.+)/);
  if (haskellBacktickCall) return haskellBacktickCall[1]!.trim();
  // Julia: @test SUBJECT == EXPECTED / @test !isnothing(SUBJECT) / @test SUBJECT !== nothing.
  const juliaTestCall = content.match(/(@test\s+.+)$/);
  if (juliaTestCall) return juliaTestCall[1]!.trim();
  // C++ Catch2: REQUIRE(...)/CHECK(...) natural-expression macros.
  const catch2Call = content.match(/\b((?:REQUIRE|CHECK)\s*\((?:[^()]|\([^()]*\))*\))/);
  if (catch2Call) return catch2Call[1] ?? '';
  // Swift Testing: #expect(...) macro.
  const swiftTestingCall = content.match(/(#expect\s*\((?:[^()]|\([^()]*\))*\))/);
  if (swiftTestingCall) return swiftTestingCall[1] ?? '';
  const assertCall = content.match(/(assert\w*\([^)]*\))/);
  if (assertCall) return assertCall[1] ?? '';
  // Rust macros: assert_eq!(...) / assert!(...) — balanced-parens capture (mirrors extractSubject)
  // since the argument itself often contains a nested call, e.g. assert!(result.is_some()).
  const rustMacro = content.match(/(assert(?:_eq)?!\s*\((?:[^()]|\([^()]*\))*\))/);
  if (rustMacro) return rustMacro[1] ?? '';
  // Dotted call shapes: Go testify (assert.Equal(...)), C# (Assert.Equal(...))
  const dottedCall = content.match(/\b([A-Za-z_]\w*\.[A-Za-z_]\w*\([^)]*\))/);
  if (dottedCall) return dottedCall[1] ?? '';
  // RSpec: expect(x).to eq(3) / expect(x).to be_truthy / expect(x).not_to be_nil
  const rspecCall = content.match(/(expect\([^)]*\)\.(?:not_to|to_not|to)\s+\w+(?:\([^)]*\))?)/);
  if (rspecCall) return rspecCall[1] ?? '';
  // Dart: expect(subject, matcher) — tried AFTER rspecCall so RSpec's `.to`-chained form (a
  // different, JS/Ruby-style `expect()`) is never truncated by this more generic pattern.
  const dartExpectCall = content.match(/(expect\s*\((?:[^()]|\([^()]*\))*\))/);
  if (dartExpectCall) return dartExpectCall[1] ?? '';
  const assertEq = content.match(/assert\s+(.+?)\s*==\s*(.+)/);
  if (assertEq) return `assert ${(assertEq[1] ?? '').trim()} == ${(assertEq[2] ?? '').trim()}`;
  // Fallback: trim leading +/- and whitespace, cap at 30 chars
  return content.replace(/^[+-]\s*/, '').trim().slice(0, 30);
}

const PY_COMPARISON_OP_RE = /==|!=|<=|>=|<|>/;

// LHS of a Python `assert LHS <op> RHS`, whitespace-normalized. Procedural (indexOf/slice) rather
// than a lazy regex, to stay linear-time on adversarial input.
function pyAssertComparisonLhs(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  if (!/^assert\b/.test(s)) return null;
  const op = s.match(PY_COMPARISON_OP_RE);
  if (!op || op.index === undefined) return null;
  const lhs = s.slice('assert'.length, op.index).trim().replace(/\s+/g, '');
  return lhs || null;
}

// A bare `assert X` (no comparison operator), whitespace-normalized — the weakened form.
function pyBareAssertExpr(line: string): string | null {
  const m = line.replace(/^\+\s*/, '').match(/^assert\s+(.+)$/);
  if (!m) return null;
  const expr = m[1]!.trim();
  if (PY_COMPARISON_OP_RE.test(expr)) return null; // still a comparison, not weakened
  return expr.replace(/\s+/g, '') || null;
}

// First argument (subject) of assertEqual(SUBJ, ...), whitespace-normalized.
function pyAssertEqualSubject(line: string): string | null {
  const m = line.match(/\bassert(?:Equal|Equals)\(\s*([^,]*),/);
  return m ? m[1]!.replace(/\s+/g, '') || null : null;
}

// Subject of a vaguer unittest matcher that a specific assertEqual might be weakened into.
function pyWeakMatcherSubject(line: string): string | null {
  const m = line.match(/\bassert(?:IsNotNone|IsNone|Greater(?:Equal)?|Less(?:Equal)?)\(\s*([^,)]*)/);
  return m ? m[1]!.replace(/\s+/g, '') || null : null;
}

// ---------------------------------------------------------------------------
// Rust: assert_eq!(SUBJECT, ...) macro weakened to assert!(SUBJECT.is_some()/.is_ok()) (same
// subject) or a bare assert!(true) (subject dropped entirely). Structurally mirrors
// pyAssertComparisonLhs/pyBareAssertExpr. NOT gated on isTestFile — Rust unit tests conventionally
// live in the same .rs file as the implementation (#[cfg(test)] mod tests), so file-extension
// gating (below, in run()) is used instead of the test-file gate other languages rely on.
// ---------------------------------------------------------------------------
const RUST_ASSERT_EQ_RE = /\bassert_eq!\s*\(\s*([^,]+),/;
const RUST_BARE_ASSERT_PREDICATE_RE = /\bassert!\s*\(\s*(!?)([^)]+?)\.(is_some|is_ok|is_none)\(\)\s*\)/;
const RUST_BARE_TRUE_RE = /\bassert!\s*\(\s*true\s*\)/;

function rustAssertEqSubject(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(RUST_ASSERT_EQ_RE);
  return m ? m[1]!.trim().replace(/\s+/g, '') || null : null;
}

// Subject of a weaker `assert!(SUBJECT.is_some())` / `assert!(SUBJECT.is_ok())` /
// `assert!(!SUBJECT.is_none())` add line. A non-negated `.is_none()` is a different, stronger
// claim (asserting absence), not a weakening of an equality check, so it's excluded.
function rustBareAssertSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const m = s.match(RUST_BARE_ASSERT_PREDICATE_RE);
  if (!m) return null;
  const negated = m[1] === '!';
  const predicate = m[3];
  if (predicate === 'is_none' && !negated) return null;
  return m[2]!.trim().replace(/\s+/g, '') || null;
}

// ---------------------------------------------------------------------------
// Ruby RSpec: expect(SUBJECT).to eq/equal/match(...) weakened to expect(SUBJECT).to be_truthy /
// not_to be_nil / be_a(...) on the SAME subject. Reuses extractSubject()'s balanced-parens shape
// (expect(...) is not JS-specific — the shape is identical in RSpec).
// ---------------------------------------------------------------------------
const RSPEC_STRONG_MATCHER_RE = /\.to\s+(?:eq|equal|match)\(/;
const RSPEC_WEAK_MATCHER_RE = /\.to\s+be_truthy\b|\.(?:not_to|to_not)\s+be_nil\b|\.to\s+be_a\(/;

// ---------------------------------------------------------------------------
// Ruby Minitest: `assert_equal expected, actual` weakened to a bare `assert actual`, structurally
// identical to Python's pyAssertEqualSubject/pyBareAssertExpr pair — except the subject is the
// SECOND argument, since Minitest's assert_equal signature is (expected, actual), the reverse of
// how pyAssertEqualSubject reads Python's assertEqual(first, second).
// ---------------------------------------------------------------------------
function rubyAssertEqualSubject(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(/\bassert_equal\s*\(?\s*[^,]+,\s*([^,)]+)\)?/);
  return m ? m[1]!.trim().replace(/\s+/g, '') || null : null;
}

function rubyBareAssertSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  if (/^assert_/.test(s)) return null; // exclude assert_equal/assert_xxx — bare `assert` only
  const m = s.match(/^assert\s*\(?\s*([^,)]+)\)?\s*$/);
  return m ? m[1]!.trim().replace(/\s+/g, '') || null : null;
}

// ---------------------------------------------------------------------------
// AssertJ (Java/Kotlin): assertThat(SUBJECT).isEqualTo(...)/isSameAs(...) weakened to
// assertThat(SUBJECT).isNotNull()/isPresent() on the SAME subject. The fluent chain means the
// subject is the assertThat(...) argument, not the trailing matcher — same-subject extraction
// (mirroring extractSubject) is more reliable here than a flat pair-list.
// ---------------------------------------------------------------------------
function extractAssertThatSubject(content: string): string | null {
  const m = content.match(/assertThat\(((?:[^()]|\([^()]*\))*)\)\s*\./);
  return m ? m[1]!.replace(/\s+/g, '') : null;
}
const ASSERTJ_STRONG_MATCHER_RE = /\.(?:isEqualTo|isSameAs)\(/;
const ASSERTJ_WEAK_MATCHER_RE = /\.(?:isNotNull|isPresent)\(\)/;

// ---------------------------------------------------------------------------
// GROUP A (LANG-11) same-subject / natural-expression extractors: Catch2 (C++), Swift Testing,
// Dart, Scala. All four use PROCEDURAL (indexOf/charAt-loop) balanced-paren scanning rather than
// an unbounded nested-quantifier regex, per RESEARCH Security Domain V5 — linear-time by
// construction, no backtracking risk. `extractBalancedParenContent` is the shared primitive.
// ---------------------------------------------------------------------------

/**
 * Procedurally find the content inside the first balanced-paren group that opens at `openIdx`
 * (which must index a '(' character), scanning left-to-right and tracking depth. Linear-time,
 * ReDoS-safe by construction — no regex backtracking is possible. Returns null if unbalanced.
 */
function extractBalancedParenContent(s: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return s.slice(openIdx + 1, i);
    }
  }
  return null;
}

// --- C++ Catch2: REQUIRE(LHS == RHS) / CHECK(LHS == RHS) weakened to bare REQUIRE(LHS) /
// CHECK(LHS) (RHS dropped). Gated on C++ extensions, NOT isTestFile — C++ test-file naming is
// convention-only, not compiler-enforced (RESEARCH LANG-08).
const CATCH2_MACRO_RE = /\b(?:REQUIRE|CHECK)\s*\(/;
const CPP_EXTENSIONS = ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'];

function isCppFile(filePath: string): boolean {
  return CPP_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

function catch2ComparisonLhs(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(CATCH2_MACRO_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  const opIdx = inner.indexOf('==');
  if (opIdx === -1) return null;
  const lhs = inner.slice(0, opIdx).trim();
  return lhs ? lhs.replace(/\s+/g, '') : null;
}

function catch2BareSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const m = s.match(CATCH2_MACRO_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  const trimmed = inner.trim();
  if (PY_COMPARISON_OP_RE.test(trimmed)) return null; // still a comparison, not weakened
  return trimmed ? trimmed.replace(/\s+/g, '') : null;
}

// --- Swift Testing (Swift 6+): #expect(LHS == RHS) weakened to #expect(LHS != nil), same
// subject. Gated on .swift.
const SWIFT_TESTING_EXPECT_RE = /#expect\s*\(/;

function swiftTestingComparisonLhs(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(SWIFT_TESTING_EXPECT_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  const opIdx = inner.indexOf('==');
  if (opIdx === -1) return null;
  const lhs = inner.slice(0, opIdx).trim();
  return lhs ? lhs.replace(/\s+/g, '') : null;
}

function swiftTestingWeakSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const m = s.match(SWIFT_TESTING_EXPECT_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  const nilMatch = inner.match(/^(.*?)!=\s*nil\s*$/);
  if (!nilMatch) return null;
  const lhs = nilMatch[1]!.trim();
  return lhs ? lhs.replace(/\s+/g, '') : null;
}

// --- Dart: expect(SUBJECT, matcher) where a specific-value matcher (equals(x), a literal) is
// weakened to a vague matcher (isNotNull/isNotEmpty/isA<...>()) on the same SUBJECT. Gated on
// .dart. The subject/matcher split is a procedural top-level-comma scan (respecting nested
// parens/brackets/braces), not a regex, since Dart matcher expressions can nest arbitrarily
// (e.g. `equals(Foo(1))`).
const DART_EXPECT_RE = /\bexpect\s*\(/;

function dartExpectArgs(line: string): { subject: string; matcher: string } | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(DART_EXPECT_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      const subject = inner.slice(0, i).trim().replace(/\s+/g, '');
      const matcher = inner.slice(i + 1).trim();
      return subject && matcher ? { subject, matcher } : null;
    }
  }
  return null;
}

function isDartStrongMatcher(matcher: string): boolean {
  const m = matcher.trim();
  if (/^equals\(/.test(m)) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(m)) return true;
  if (/^(['"]).*\1$/.test(m)) return true;
  if (/^(?:true|false)$/.test(m)) return true;
  return false;
}

function isDartWeakMatcher(matcher: string): boolean {
  const m = matcher.trim().replace(/\s+/g, '');
  return /^(?:isNotNull|isNotEmpty)$/.test(m) || /^isA<[^>]*>\(\)$/.test(m);
}

// --- Scala: assert(LHS == RHS) weakened to bare assert(LHS) or assert(LHS != null), same
// subject. Gated on .scala. Scala's assert(...) is a stdlib Predef function/macro taking a bare
// boolean expression — structurally identical to Python's `assert` keyword.
const SCALA_ASSERT_RE = /\bassert\s*\(/;

function scalaComparisonLhs(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(SCALA_ASSERT_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  const opIdx = inner.indexOf('==');
  if (opIdx === -1) return null;
  const lhs = inner.slice(0, opIdx).trim();
  return lhs ? lhs.replace(/\s+/g, '') : null;
}

function scalaWeakSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const m = s.match(SCALA_ASSERT_RE);
  if (!m || m.index === undefined) return null;
  const inner = extractBalancedParenContent(s, m.index + m[0].length - 1);
  if (inner === null) return null;
  const trimmed = inner.trim();
  const nullCheck = trimmed.match(/^(.*?)!=\s*null\s*$/);
  if (nullCheck) {
    const lhs = nullCheck[1]!.trim();
    return lhs ? lhs.replace(/\s+/g, '') : null;
  }
  if (PY_COMPARISON_OP_RE.test(trimmed)) return null; // still a comparison, not weakened
  return trimmed ? trimmed.replace(/\s+/g, '') : null;
}

// ---------------------------------------------------------------------------
// GROUP B (LANG-11) same-subject / natural-expression extractors: Haskell, Elixir, Clojure,
// Julia. All PROCEDURAL (indexOf/charAt-loop) or bounded — no unbounded nested-quantifier regex,
// per RESEARCH Security Domain V5, which specifically flags Clojure's S-expression shape.
// ---------------------------------------------------------------------------

// --- Elixir: `assert LHS == RHS` weakened to bare `assert LHS` (RHS dropped) — byte-identical
// shape to Python's pyAssertComparisonLhs/pyBareAssertExpr, gated on .ex/.exs instead of .py.
function elixirAssertComparisonLhs(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  if (!/^assert\b/.test(s)) return null;
  const op = s.match(PY_COMPARISON_OP_RE);
  if (!op || op.index === undefined) return null;
  const lhs = s.slice('assert'.length, op.index).trim().replace(/\s+/g, '');
  return lhs || null;
}

function elixirBareAssertExpr(line: string): string | null {
  const m = line.replace(/^\+\s*/, '').match(/^assert\s+(.+)$/);
  if (!m) return null;
  const expr = m[1]!.trim();
  if (PY_COMPARISON_OP_RE.test(expr)) return null; // still a comparison, not weakened
  return expr.replace(/\s+/g, '') || null;
}

// --- Haskell (Hspec): `` LHS `shouldBe` RHS `` weakened to `` LHS `shouldSatisfy` isJust `` or
// `` LHS `shouldNotBe` Nothing `` (same subject). Gated on .hs. Procedural split on the
// backtick-infix token (indexOf-based), not a regex, mirroring pyAssertComparisonLhs's
// procedural-not-regex approach for ReDoS safety.
function haskellShouldBeLhs(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const idx = s.indexOf('`shouldBe`');
  if (idx === -1) return null;
  const lhs = s.slice(0, idx).trim();
  return lhs ? lhs.replace(/\s+/g, '') : null;
}

function haskellWeakLhs(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const satisfyIdx = s.indexOf('`shouldSatisfy`');
  if (satisfyIdx !== -1) {
    const lhs = s.slice(0, satisfyIdx).trim();
    return lhs ? lhs.replace(/\s+/g, '') : null;
  }
  const notBeIdx = s.indexOf('`shouldNotBe`');
  if (notBeIdx !== -1) {
    const lhs = s.slice(0, notBeIdx).trim();
    return lhs ? lhs.replace(/\s+/g, '') : null;
  }
  return null;
}

// --- Julia (Test stdlib): `@test SUBJECT == EXPECTED` weakened to `@test !isnothing(SUBJECT)` or
// `@test SUBJECT !== nothing` (same subject). Gated on .jl. Procedural split using the shared
// PY_COMPARISON_OP_RE (not a bespoke lazy regex) to locate the comparison operator.
const JULIA_TEST_RE = /@test\s+/;

function juliaComparisonSubject(line: string): string | null {
  const s = line.replace(/^[-+]\s*/, '');
  const m = s.match(JULIA_TEST_RE);
  if (!m || m.index === undefined) return null;
  const rest = s.slice(m.index + m[0].length);
  const op = rest.match(PY_COMPARISON_OP_RE);
  if (!op || op.index === undefined) return null;
  const subject = rest.slice(0, op.index).trim();
  return subject ? subject.replace(/\s+/g, '') : null;
}

function juliaWeakSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const m = s.match(JULIA_TEST_RE);
  if (!m || m.index === undefined) return null;
  const rest = s.slice(m.index + m[0].length).trim();
  const isNothingMatch = rest.match(/^!isnothing\((.+)\)$/);
  if (isNothingMatch) return isNothingMatch[1]!.trim().replace(/\s+/g, '');
  const notNothingMatch = rest.match(/^(.+?)\s*!==\s*nothing$/);
  if (notNothingMatch) return notNothingMatch[1]!.trim().replace(/\s+/g, '');
  return null;
}

// --- Clojure (clojure.test): `(is (= SUBJECT EXPECTED))` weakened to `(is (some? SUBJECT))` or
// bare `(is SUBJECT)`. Gated on .clj/.cljc. This is the genuinely-new S-expression shape (prefix
// notation, whitespace-delimited, not comma-delimited) — extraction is a PROCEDURAL paren-depth
// counter (charAt/index-loop), NOT a balanced-parens regex, per threat T-08.1-08a.
//
// clojure.test idiom order for `(= ...)` isn't strictly standardized (some codebases write
// `(is (= actual expected))`, others `(is (= expected actual))` mirroring JUnit's
// assertEquals(expected, actual)) — so both arguments of the equality are captured, and the
// weakened side is considered a match if it preserves EITHER one, rather than assuming a fixed
// argument position.
const CLOJURE_EXTENSIONS = ['.clj', '.cljc'];

function isClojureFile(filePath: string): boolean {
  return CLOJURE_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i++;
  return i;
}

/**
 * Read one Clojure S-expression token starting at index `i`: either a parenthesized form (walked
 * via paren-depth tracking to its matching close, handling arbitrary nesting) or a bare
 * whitespace/paren-delimited token. Returns the token text and the index just past it, or null.
 * Linear-time, ReDoS-safe by construction — no regex backtracking is possible.
 */
function readSExprToken(s: string, i: number): { token: string; next: number } | null {
  i = skipWs(s, i);
  if (i >= s.length) return null;
  const start = i;
  if (s[i] === '(') {
    let depth = 0;
    for (; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
  } else {
    for (; i < s.length; i++) {
      if (/\s/.test(s[i]!) || s[i] === '(' || s[i] === ')') break;
    }
  }
  const token = s.slice(start, i);
  return token ? { token, next: i } : null;
}

function clojureEqualsArgs(line: string): { first: string; second: string } | null {
  const s = line.replace(/^[-+]\s*/, '');
  const eqIdx = s.indexOf('(=');
  if (eqIdx === -1) return null;
  const firstTok = readSExprToken(s, eqIdx + 2);
  if (!firstTok) return null;
  const secondTok = readSExprToken(s, firstTok.next);
  if (!secondTok) return null;
  return {
    first: firstTok.token.replace(/\s+/g, ''),
    second: secondTok.token.replace(/\s+/g, ''),
  };
}

function clojureWeakSubject(line: string): string | null {
  const s = line.replace(/^\+\s*/, '');
  const isIdx = s.indexOf('(is');
  if (isIdx === -1) return null;
  const i = skipWs(s, isIdx + 3);
  // `(some? SUBJECT)` — a parenthesized form itself (opening paren + "some?"), not a bare token.
  if (s.startsWith('(some?', i)) {
    const result = readSExprToken(s, i + '(some?'.length);
    return result ? result.token.replace(/\s+/g, '') : null;
  }
  if (s[i] === '=') return null; // still the strong (= ...) form, not weakened
  const result = readSExprToken(s, i);
  return result ? result.token.replace(/\s+/g, '') : null;
}

/**
 * Full `(is ...)` label text (for messages), procedurally paren-depth-matched to handle arbitrary
 * nesting (e.g. `(is (= (add 2 3) 5))`) without truncation. Whitespace is collapsed to single
 * spaces for readability, but parens are never regex-matched.
 */
function extractClojureIsLabel(content: string): string | null {
  const s = content.replace(/^[-+]\s*/, '');
  const isIdx = s.indexOf('(is');
  if (isIdx === -1) return null;
  let depth = 0;
  for (let i = isIdx; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return s.slice(isIdx, i + 1).replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

function run(context: Context): Finding[] {
  const files = context.files;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';

    for (const chunk of file.chunks) {
      const dels = chunk.changes.filter(c => c.type === 'del');
      const adds = chunk.changes.filter(c => c.type === 'add');

      // Track reported add-line numbers to avoid duplicate findings within the same chunk
      const reported = new Set<number>();

      for (const del of dels) {
        if (!isStrongAssertion(del.content)) continue;
        const delSubject = extractSubject(del.content);
        const weakAdd = adds.find(a => {
          if (reported.has((a as { ln: number }).ln)) return false;
          // Unconditionally-weak add pairs with any removed strong assertion in the chunk.
          if (isWeakAssertion(a.content)) return true;
          // Contextually-weak add only counts when it targets the SAME subject as the removed
          // strong assertion, so an unrelated legit `toBeGreaterThan(0)` elsewhere doesn't pair.
          if (isContextualWeak(a.content)) {
            const addSubject = extractSubject(a.content);
            if (delSubject === null || addSubject === null || delSubject !== addSubject) return false;
            // If a strong assertion on the same subject still survives among the adds, the value
            // is not actually weakened (e.g. keeping `toBe(6)` while adding a redundant range check).
            const stillStrong = adds.some(o => isStrongAssertion(o.content) && extractSubject(o.content) === addSubject);
            return !stillStrong;
          }
          return false;
        });
        if (!weakAdd) continue;
        reported.add((weakAdd as { ln: number }).ln);

        const fromLabel = extractLabel(del.content);
        const toLabel = extractLabel(weakAdd.content);

        findings.push({
          verifierId: 'RH002',
          severity: 'error',
          file: filePath,
          line: (weakAdd as { ln: number }).ln,
          message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
          suggestion: 'Restore the specific value assertion to preserve test coverage strength.',
        });
      }

      // Python assertAlmostEqual tolerance-widening: detect when places= value is reduced
      // or when assertAlmostEqual is replaced with a weaker assertion (assertTrue/pass/etc.)
      for (const del of dels) {
        if (!ALMOST_EQUAL.test(del.content)) continue;
        const delPlaces = del.content.match(/places\s*=\s*(\d+)/);

        const weakerAdd = adds.find(a => {
          if (reported.has((a as { ln: number }).ln)) return false; // already reported in this chunk
          // Case A: replaced with a weak assertion (assertTrue, assert True, pass, etc.)
          if (WEAK_PATTERNS.some(p => p.test(a.content))) return true;
          // Case B: still assertAlmostEqual but with fewer decimal places (looser tolerance)
          // Also handles the case where del had no places= (default 7) but add has an explicit lower value
          if (ALMOST_EQUAL.test(a.content)) {
            const addPlaces = a.content.match(/places\s*=\s*(\d+)/);
            if (addPlaces === null) return false;
            const addVal = parseInt(addPlaces[1]!);
            if (delPlaces === null) return addVal < 7; // 7 is Python's default precision
            return addVal < parseInt(delPlaces[1]!);
          }
          return false;
        });

        if (!weakerAdd) continue;
        reported.add((weakerAdd as { ln: number }).ln);

        findings.push({
          verifierId: 'RH002',
          severity: 'error',
          file: filePath,
          line: (weakerAdd as { ln: number }).ln,
          message: 'Assertion weakened from assertAlmostEqual to a less precise check.',
          suggestion: 'Restore the specific precision in assertAlmostEqual or use assertEqual.',
        });
      }

      // Python assert weakening, same-subject: `assert x == y` -> `assert x` (drop the RHS), or
      // `assertEqual(x, ...)` -> `assertIsNotNone(x)`/`assertGreater(x, ...)`/etc. Only on .py.
      if (filePath.endsWith('.py')) {
        for (const del of dels) {
          const lhs = pyAssertComparisonLhs(del.content);
          if (lhs) {
            const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && pyBareAssertExpr(a.content) === lhs);
            if (wa) {
              reported.add((wa as { ln: number }).ln);
              findings.push({
                verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
                message: 'Assertion weakened from an equality check to a bare truthiness assert (the expected value was dropped).',
                suggestion: 'Restore the `== expected` comparison so the test checks the actual value.',
              });
              continue;
            }
          }
          const subj = pyAssertEqualSubject(del.content);
          if (subj) {
            const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && pyWeakMatcherSubject(a.content) === subj);
            if (wa) {
              reported.add((wa as { ln: number }).ln);
              findings.push({
                verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
                message: 'Assertion weakened from assertEqual to a less specific matcher on the same value.',
                suggestion: 'Restore assertEqual against the expected value.',
              });
            }
          }
        }
      }

      // Rust: assert_eq! macro weakened to assert!(...) same-subject, or a bare assert!(true).
      // Gated on file extension (.rs), NOT isTestFile — Rust tests commonly live inline with impl.
      if (filePath.endsWith('.rs')) {
        for (const del of dels) {
          const subj = rustAssertEqSubject(del.content);
          if (!subj) continue;
          const wa = adds.find(a => {
            if (reported.has((a as { ln: number }).ln)) return false;
            if (RUST_BARE_TRUE_RE.test(a.content)) return true;
            return rustBareAssertSubject(a.content) === subj;
          });
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the assert_eq! comparison against the expected value.',
          });
        }
      }

      // Ruby: RSpec same-subject matcher weakening + Minitest assert_equal -> bare assert.
      if (filePath.endsWith('.rb')) {
        for (const del of dels) {
          if (!RSPEC_STRONG_MATCHER_RE.test(del.content)) continue;
          const subj = extractSubject(del.content);
          if (!subj) continue;
          const wa = adds.find(a =>
            !reported.has((a as { ln: number }).ln) &&
            RSPEC_WEAK_MATCHER_RE.test(a.content) &&
            extractSubject(a.content) === subj
          );
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the specific matcher (eq/equal/match) against the expected value.',
          });
        }

        for (const del of dels) {
          const subj = rubyAssertEqualSubject(del.content);
          if (!subj) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && rubyBareAssertSubject(a.content) === subj);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the assert_equal comparison against the expected value.',
          });
        }
      }

      // AssertJ (Java/Kotlin): assertThat(subject).isEqualTo/isSameAs(...) -> isNotNull()/isPresent() same-subject.
      if (filePath.endsWith('.java') || filePath.endsWith('.kt')) {
        for (const del of dels) {
          if (!ASSERTJ_STRONG_MATCHER_RE.test(del.content)) continue;
          const subj = extractAssertThatSubject(del.content);
          if (!subj) continue;
          const wa = adds.find(a =>
            !reported.has((a as { ln: number }).ln) &&
            ASSERTJ_WEAK_MATCHER_RE.test(a.content) &&
            extractAssertThatSubject(a.content) === subj
          );
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the specific AssertJ matcher against the expected value.',
          });
        }
      }

      // GROUP A (LANG-11) same-subject / natural-expression extractors.

      // C++ Catch2: REQUIRE/CHECK(LHS == RHS) -> bare REQUIRE/CHECK(LHS), same subject.
      if (isCppFile(filePath)) {
        for (const del of dels) {
          const lhs = catch2ComparisonLhs(del.content);
          if (!lhs) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && catch2BareSubject(a.content) === lhs);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the REQUIRE/CHECK comparison against the expected value.',
          });
        }
      }

      // Swift Testing: #expect(LHS == RHS) -> #expect(LHS != nil), same subject.
      if (filePath.endsWith('.swift')) {
        for (const del of dels) {
          const lhs = swiftTestingComparisonLhs(del.content);
          if (!lhs) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && swiftTestingWeakSubject(a.content) === lhs);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the #expect comparison against the expected value.',
          });
        }
      }

      // Dart: expect(SUBJECT, strongMatcher) -> expect(SUBJECT, weakMatcher), same subject.
      if (filePath.endsWith('.dart')) {
        for (const del of dels) {
          const delArgs = dartExpectArgs(del.content);
          if (!delArgs || !isDartStrongMatcher(delArgs.matcher)) continue;
          const wa = adds.find(a => {
            if (reported.has((a as { ln: number }).ln)) return false;
            const addArgs = dartExpectArgs(a.content);
            return !!addArgs && addArgs.subject === delArgs.subject && isDartWeakMatcher(addArgs.matcher);
          });
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the specific-value matcher against the expected value.',
          });
        }
      }

      // Scala: assert(LHS == RHS) -> bare assert(LHS) / assert(LHS != null), same subject.
      if (filePath.endsWith('.scala')) {
        for (const del of dels) {
          const lhs = scalaComparisonLhs(del.content);
          if (!lhs) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && scalaWeakSubject(a.content) === lhs);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the assert comparison against the expected value.',
          });
        }
      }

      // GROUP B (LANG-11) same-subject / natural-expression extractors.

      // Elixir: assert LHS == RHS -> bare assert LHS (RHS dropped), same subject. Mirrors the
      // Python block above exactly (byte-identical shape), gated on .ex/.exs instead of .py.
      if (filePath.endsWith('.ex') || filePath.endsWith('.exs')) {
        for (const del of dels) {
          const lhs = elixirAssertComparisonLhs(del.content);
          if (!lhs) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && elixirBareAssertExpr(a.content) === lhs);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: 'Assertion weakened from an equality check to a bare truthiness assert (the expected value was dropped).',
            suggestion: 'Restore the `== expected` comparison so the test checks the actual value.',
          });
        }
      }

      // Haskell: LHS `shouldBe` RHS -> LHS `shouldSatisfy` isJust / LHS `shouldNotBe` Nothing, same subject.
      if (filePath.endsWith('.hs')) {
        for (const del of dels) {
          const lhs = haskellShouldBeLhs(del.content);
          if (!lhs) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && haskellWeakLhs(a.content) === lhs);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the `shouldBe` comparison against the expected value.',
          });
        }
      }

      // Julia: @test SUBJECT == EXPECTED -> @test !isnothing(SUBJECT) / @test SUBJECT !== nothing, same subject.
      if (filePath.endsWith('.jl')) {
        for (const del of dels) {
          const subj = juliaComparisonSubject(del.content);
          if (!subj) continue;
          const wa = adds.find(a => !reported.has((a as { ln: number }).ln) && juliaWeakSubject(a.content) === subj);
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the @test comparison against the expected value.',
          });
        }
      }

      // Clojure: (is (= SUBJECT EXPECTED)) -> (is (some? SUBJECT)) or bare (is SUBJECT), same subject.
      if (isClojureFile(filePath)) {
        for (const del of dels) {
          const args = clojureEqualsArgs(del.content);
          if (!args) continue;
          const wa = adds.find(a => {
            if (reported.has((a as { ln: number }).ln)) return false;
            const weakSubj = clojureWeakSubject(a.content);
            return weakSubj !== null && (weakSubj === args.first || weakSubj === args.second);
          });
          if (!wa) continue;
          reported.add((wa as { ln: number }).ln);
          const fromLabel = extractLabel(del.content);
          const toLabel = extractLabel(wa.content);
          findings.push({
            verifierId: 'RH002', severity: 'error', file: filePath, line: (wa as { ln: number }).ln,
            message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
            suggestion: 'Restore the (is (= ...)) comparison against the expected value.',
          });
        }
      }
    }
  }

  return findings;
}

export const rh002: Verifier = { id: 'RH002', severity: 'error', run };
