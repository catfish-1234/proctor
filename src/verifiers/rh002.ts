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
];

// Weak assertion patterns (vague assertions)
const WEAK_PATTERNS = [
  /\.toBeDefined\(\)/,
  /\.toBeTruthy\(\)/,
  /\.toBeNull\(\)/,
  /\.toEqual\(\)/,
  /\.toThrow\(\)(?!\s*['"`(])/,
  /assertTrue\(/,
  /assert True/,
  /^\+\s*pass\s*$/,
];

function isStrongAssertion(content: string): boolean {
  return STRONG_PATTERNS.some(p => p.test(content));
}

function isWeakAssertion(content: string): boolean {
  return WEAK_PATTERNS.some(p => p.test(content));
}

// Python assertAlmostEqual pattern — matches tolerance-widening when places= value is reduced
const ALMOST_EQUAL = /assertAlmostEqual\(/;

/** Extract a short label like 'toBe(3)' or 'toBeDefined()' from a diff line. */
function extractLabel(content: string): string {
  // Try to match a method call like .toXxx(...) or assertEqual(...)
  const methodCall = content.match(/\.(to\w+\([^)]*\))/);
  if (methodCall) return methodCall[1] ?? '';
  const assertCall = content.match(/(assert\w*\([^)]*\))/);
  if (assertCall) return assertCall[1] ?? '';
  const assertEq = content.match(/assert\s+(.+?)\s*==\s*(.+)/);
  if (assertEq) return `assert ${(assertEq[1] ?? '').trim()} == ${(assertEq[2] ?? '').trim()}`;
  // Fallback: trim leading +/- and whitespace, cap at 30 chars
  return content.replace(/^[+-]\s*/, '').trim().slice(0, 30);
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
        const weakAdd = adds.find(a => isWeakAssertion(a.content) && !reported.has((a as { ln: number }).ln));
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
    }
  }

  return findings;
}

export const rh002: Verifier = { id: 'RH002', severity: 'error', run };
