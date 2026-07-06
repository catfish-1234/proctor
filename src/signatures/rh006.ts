import micromatch from 'micromatch';
import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

// Default snapshot/golden file globs — rh006.ts owns these (not context.ts)
// Per D-09: configurable via snapshotGlobs in proctor.config.json
const DEFAULT_SNAPSHOT_GLOBS = [
  '**/__snapshots__/*.snap',
  '**/*.snap.ts',
  '**/golden/**',
  '**/__fixtures__/**',
];

// D-10: commit message contains one of these keywords → reason stated → no finding
// Patterns are intentionally specific to avoid suppression by unrelated words like
// "snappy", "expected behavior", etc.
const REASON_KEYWORDS = /\bsnapsho?t\b|golden\b|regenerat|intentional\b|by design\b/i;

export function rh006(files: ParsedFile[], ctx: RepoContext): Finding[] {
  const findings: Finding[] = [];
  const globs = ctx.snapshotGlobs ?? DEFAULT_SNAPSHOT_GLOBS;

  // If commit message contains a reason keyword, suppress all RH006 findings
  const hasReason = ctx.commitMessage ? REASON_KEYWORDS.test(ctx.commitMessage) : false;
  if (hasReason) return [];

  for (const file of files) {
    // Normalize path separator for cross-platform micromatch (Windows uses backslash)
    const filePath = (file.to ?? file.from ?? '').replace(/\\/g, '/');
    if (!micromatch.isMatch(filePath, globs)) continue;

    // Skip pure-deletion diffs — removing old snapshots is routine maintenance, not suspicious
    const firstAdd = file.chunks.flatMap(c => c.changes).find(c => c.type === 'add');
    if (!firstAdd) continue;
    const line = (firstAdd as { ln: number }).ln;

    findings.push({
      ruleId: 'RH006',
      severity: 'warn',
      file: filePath,
      line,
      message: 'Snapshot file rewritten without a stated reason in the commit message.',
      remediation: 'Add a reason to the commit message or verify the snapshot update is intentional.',
    });
  }

  return findings;
}
