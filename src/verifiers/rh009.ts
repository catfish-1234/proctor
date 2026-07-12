import type { Context, Finding, Verifier } from '../types.js';

// Assertion patterns strong enough to count as "real" coverage — deliberately excludes weak
// matchers (toBeDefined/toBeTruthy/etc, shared with RH002) so a test that only checks "it ran"
// doesn't count as replacing what was removed.
const STRONG_ASSERTION_RE = [
  /\.toBe\(/,
  /\.toEqual\(/,
  /\.toStrictEqual\(/,
  /\.toMatchObject\(/,
  /\.toContain\(/,
  /\.toHaveBeenCalledWith\(/,
  /\.toThrow\(['"`]/,
  /assertEqual\(/,
  /assertIn\(/,
  /assertRaises\(/,
  /assertAlmostEqual\(/,
  /assert\s+\S.*(?:==|!=|<=|>=|<|>)\s*\S/,
];

const TEST_DECL_RE = /^\+\s*(?:it|test)\s*\(\s*['"`]|^\+\s*(?:async\s+)?def\s+test_/;

function isStrongAssertion(content: string): boolean {
  return STRONG_ASSERTION_RE.some(re => re.test(content));
}

/**
 * RH009 catches coverage gaming: it only flags when a file's diff shows both a real assertion
 * removed and a trivial test added with no strong assertion of its own.
 * Requiring both conditions in the same file is what keeps this conservative: adding
 * a harmless smoke test alone, or removing an assertion alone, does not trigger it.
 */
function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    if (!ctx.isTestFile(filePath)) continue;

    let assertionsRemoved = 0;
    const trivialTestLines: number[] = [];

    for (const chunk of file.chunks) {
      const dels = chunk.changes.filter(c => c.type === 'del');
      const adds = chunk.changes.filter(c => c.type === 'add');

      assertionsRemoved += dels.filter(d => isStrongAssertion(d.content)).length;

      const declLine = adds.find(a => TEST_DECL_RE.test(a.content));
      if (declLine && !adds.some(a => isStrongAssertion(a.content))) {
        trivialTestLines.push((declLine as { ln: number }).ln);
      }
    }

    if (assertionsRemoved === 0 || trivialTestLines.length === 0) continue;

    for (const line of trivialTestLines) {
      findings.push({
        verifierId: 'RH009',
        severity: 'warn',
        file: filePath,
        line,
        message: `Trivial test added with no specific-value assertion while ${assertionsRemoved} real assertion${assertionsRemoved === 1 ? '' : 's'} were removed from this file.`,
        suggestion: 'Restore the removed assertions, or make the new test assert a specific expected value.',
      });
    }
  }

  return findings;
}

export const rh009: Verifier = { id: 'RH009', severity: 'warn', run };
