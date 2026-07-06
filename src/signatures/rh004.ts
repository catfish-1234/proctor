import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

// Extract string/number literals from a diff line
const LITERAL_RE = /(?:["'`])([^"'`\n]+?)(?:["'`])|(?<!\w)(\d+(?:\.\d+)?)(?!\w)/g;

function extractLiterals(line: string): Set<string> {
  const result = new Set<string>();
  for (const m of line.matchAll(LITERAL_RE)) {
    const val = m[1] ?? m[2];
    if (val !== undefined) result.add(val);
  }
  return result;
}

export async function rh004(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]> {
  // Step 1 — Collect candidates (heuristic always runs, D-12):
  // Collect added literals from impl files; add+del literals from test files
  const implLiterals = new Map<string, Array<{ file: string; line: number; content: string }>>();
  const testLiterals = new Set<string>();

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    const isTest = ctx.isTestFile(filePath);

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add' && change.type !== 'del') continue;
        const lits = extractLiterals(change.content);
        if (isTest) {
          // Test file: collect literals from both adds and dels
          lits.forEach(l => testLiterals.add(l));
        } else if (change.type === 'add') {
          // Impl file: only collect from added lines
          lits.forEach(l => {
            if (!implLiterals.has(l)) implLiterals.set(l, []);
            implLiterals.get(l)!.push({
              file: filePath,
              line: (change as { ln: number }).ln,
              content: change.content,
            });
          });
        }
      }
    }
  }

  // Step 2 — AI gate (D-11): if AI not enabled, return [] regardless of candidates
  if (!ctx.aiEnabled || !ctx.judge) return [];

  // Step 3 — Confirm candidates with AI judge
  // Candidates: impl added literals that also appear in test diff lines
  const candidates = [...implLiterals.entries()]
    .filter(([lit]) => testLiterals.has(lit))
    .flatMap(([, locs]) => locs);

  const findings: Finding[] = [];
  for (const c of candidates) {
    const isCheat = await ctx.judge.judge({
      ruleId: 'RH004',
      diffExcerpt: c.content,
      explanation: 'The implementation returns a hardcoded literal that matches a value expected by the test.',
    });
    if (isCheat) {
      findings.push({
        ruleId: 'RH004',
        severity: 'error',
        file: c.file,
        line: c.line,
        message: 'Implementation appears to hardcode a value matching the test fixture literal.',
        remediation: 'Implement real logic instead of returning a hardcoded value.',
      });
    }
  }
  return findings;
}
