import micromatch from 'micromatch';
import type { Context, Finding, Verifier } from '../types.js';

// Default snapshot/golden file globs. This file owns these defaults, not context/index.ts.
// Override them with snapshotGlobs in proctor.config.json.
const DEFAULT_SNAPSHOT_GLOBS = [
  '**/__snapshots__/*.snap',
  '**/*.snap.ts',
  '**/golden/**',
  '**/__fixtures__/**',
];

// If the commit message contains one of these keywords, treat the reason as stated and skip
// the finding. The patterns are intentionally specific so they don't get triggered by unrelated
// words like "snappy" or "expected behavior".
const REASON_KEYWORDS = /\bsnapsho?t\b|golden\b|regenerat|intentional\b|by design\b/i;

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];
  const globs = ctx.snapshotGlobs ?? DEFAULT_SNAPSHOT_GLOBS;

  // Commit-message reason suppression only applies to a genuinely committed diff (`check --base
  // <ref>`), where commitMessage actually describes the change being checked. For a
  // working-tree/staged check, commitMessage is whatever the last unrelated commit said. Using
  // it here would either accidentally suppress (if that unrelated message happens to contain a
  // reason keyword) or accidentally flag a reason the developer hasn't committed yet. The
  // documented way to state a reason for an uncommitted change is the generic inline
  // `proctor-ignore: RH006 reason: ...` comment (applied by the engine for every verifier).
  const hasReason = ctx.committedDiff && ctx.commitMessage ? REASON_KEYWORDS.test(ctx.commitMessage) : false;
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
      verifierId: 'RH006',
      severity: 'warn',
      file: filePath,
      line,
      message: 'Snapshot file rewritten without a stated reason in the commit message.',
      suggestion: 'Add a reason to the commit message or verify the snapshot update is intentional.',
    });
  }

  return findings;
}

export const rh006: Verifier = { id: 'RH006', severity: 'warn', run };
