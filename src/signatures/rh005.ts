import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

// Gutted body patterns: return null/undefined/None or pass (D-13)
const GUTTED_RE = /^\+\s*(?:return\s+(?:null|undefined|None)|pass)\s*;?\s*$/;
// Empty function body (D-13)
const EMPTY_BODY_RE = /^\+\s*\{\s*\}\s*$/;

export async function rh005(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]> {
  // Step 1 — Collect candidates (heuristic, D-13):
  const candidates: Array<{ file: string; line: number; excerpt: string }> = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    // D-13: only analyze impl files, skip test files
    if (ctx.isTestFile(filePath)) continue;

    for (const chunk of file.chunks) {
      const dels = chunk.changes.filter(c => c.type === 'del');
      const adds = chunk.changes.filter(c => c.type === 'add');

      // Heuristic: body must shrink (more dels than adds)
      if (dels.length <= adds.length) continue;

      // Check that at least one add matches a gutted pattern
      const guttedAdds = adds.filter(
        c => GUTTED_RE.test(c.content) || EMPTY_BODY_RE.test(c.content)
      );
      if (guttedAdds.length === 0) continue;

      const firstGutted = guttedAdds[0]!;
      candidates.push({
        file: filePath,
        line: (firstGutted as { ln: number }).ln,
        excerpt: [
          ...dels.map(c => c.content),
          ...adds.map(c => c.content),
        ].join('\n'),
      });
    }
  }

  // Step 2 — AI gate (D-11): if AI not enabled, return [] regardless of candidates
  if (!ctx.aiEnabled || !ctx.judge) return [];

  // Step 3 — Confirm candidates with AI judge
  const findings: Finding[] = [];
  for (const c of candidates) {
    const isCheat = await ctx.judge.judge({
      ruleId: 'RH005',
      diffExcerpt: c.excerpt,
      explanation: 'The function body was gutted — replaced with a no-op return while tests still pass.',
    });
    if (isCheat) {
      findings.push({
        ruleId: 'RH005',
        severity: 'error',
        file: c.file,
        line: c.line,
        message: 'Function body appears to be gutted — replaced with return null/undefined/pass.',
        remediation: 'Restore the real implementation logic.',
      });
    }
  }
  return findings;
}
