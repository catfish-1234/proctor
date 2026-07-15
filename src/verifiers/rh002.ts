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
  const assertCall = content.match(/(assert\w*\([^)]*\))/);
  if (assertCall) return assertCall[1] ?? '';
  // Rust macros: assert_eq!(...) / assert!(...)
  const rustMacro = content.match(/(assert(?:_eq)?!\s*\([^)]*\))/);
  if (rustMacro) return rustMacro[1] ?? '';
  // Dotted call shapes: Go testify (assert.Equal(...)), C# (Assert.Equal(...))
  const dottedCall = content.match(/\b([A-Za-z_]\w*\.[A-Za-z_]\w*\([^)]*\))/);
  if (dottedCall) return dottedCall[1] ?? '';
  // RSpec: expect(x).to eq(3) / expect(x).to be_truthy / expect(x).not_to be_nil
  const rspecCall = content.match(/(expect\([^)]*\)\.(?:not_to|to_not|to)\s+\w+(?:\([^)]*\))?)/);
  if (rspecCall) return rspecCall[1] ?? '';
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
    }
  }

  return findings;
}

export const rh002: Verifier = { id: 'RH002', severity: 'error', run };
