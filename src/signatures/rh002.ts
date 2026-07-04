import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

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

export function rh002(files: ParsedFile[], _ctx: RepoContext): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';

    for (const chunk of file.chunks) {
      const dels = chunk.changes.filter(c => c.type === 'del');
      const adds = chunk.changes.filter(c => c.type === 'add');

      for (const del of dels) {
        if (!isStrongAssertion(del.content)) continue;
        const weakAdd = adds.find(a => isWeakAssertion(a.content));
        if (!weakAdd) continue;

        const fromLabel = extractLabel(del.content);
        const toLabel = extractLabel(weakAdd.content);

        findings.push({
          ruleId: 'RH002',
          severity: 'error',
          file: filePath,
          line: (weakAdd as { ln: number }).ln,
          message: `Assertion weakened from ${fromLabel} to ${toLabel}.`,
          remediation: 'Restore the specific value assertion to preserve test coverage strength.',
        });
      }
    }
  }

  return findings;
}
