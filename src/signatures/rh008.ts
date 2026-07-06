import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

// Tautological assertion patterns (D-14)
const ASSERT_TRUE = /\bassert True\b/;
const ASSERT_SELF = /\bassert\s+(\w+)\s*==\s*\1\b/;
const EXPECT_SELF = /expect\((.+?)\)\.toBe\(\1\)/;
const EXPECT_ZERO_ARG = /expect\(\s*\)\.(toBeTruthy|toBeDefined|toBeNull)\(\)/;

function isTautology(content: string): boolean {
  return (
    ASSERT_TRUE.test(content) ||
    ASSERT_SELF.test(content) ||
    EXPECT_SELF.test(content) ||
    EXPECT_ZERO_ARG.test(content)
  );
}

export async function rh008(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]> {
  // Step 1: collect candidates via heuristic (always runs, even without AI)
  const candidates: Array<{ file: string; line: number; excerpt: string }> = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    if (!ctx.isTestFile(filePath)) continue; // only test files for tautological assertions

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (!isTautology(change.content)) continue;
        candidates.push({
          file: filePath,
          line: (change as { ln: number }).ln,
          excerpt: change.content,
        });
      }
    }
  }

  // Step 2: AI gate (D-11) — return [] without AI regardless of candidates
  if (!ctx.aiEnabled || !ctx.judge) return [];

  // Step 3: AI confirmation for each candidate
  const findings: Finding[] = [];
  for (const c of candidates) {
    const isCheat = await ctx.judge.judge({
      ruleId: 'RH008',
      diffExcerpt: c.excerpt,
      explanation: 'The added test assertion always passes without testing real behavior (tautological).',
    });
    if (isCheat) {
      findings.push({
        ruleId: 'RH008',
        severity: 'warn',
        file: c.file,
        line: c.line,
        message: 'Tautological assertion detected — always passes without testing real behavior.',
        remediation: 'Replace with a meaningful assertion that checks actual output.',
      });
    }
  }
  return findings;
}
