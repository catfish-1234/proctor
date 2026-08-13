import type { ParsedFile } from './diff.js';
import type { ApprovedTestChange, Context, Finding, Severity } from './types.js';
import { VERIFIERS } from './verifiers/registry.js';
import micromatch from 'micromatch';

const norm = (p: string) => p.replace(/\\/g, '/');

/**
 * runChecks: run Verifier[] -> aggregate Findings. Takes the
 * already-built Context (which owns the discovered diff via context.files),
 * runs every registry Verifier whose id is enabled, aggregates + filters the
 * resulting Finding[].
 */
export async function runChecks(context: Context): Promise<Finding[]> {
  const activeVerifiers = VERIFIERS.filter(v => context.enabled.includes(v.id));
  // A verifier failure means the repository was not checked. Treating that as zero findings mints
  // an honest pass from missing evidence, contradicting the pre-commit hook's fail-closed contract.
  // Optional AI failures are caught inside RH004/RH005, where deterministic results remain usable;
  // an uncaught verifier failure is infrastructure failure and must propagate.
  const raw = (await Promise.all(activeVerifiers.map(v => Promise.resolve(v.run(context))))).flat();
  const afterSuppression = applySuppression(raw, context.files);
  const afterIgnore = applyIgnorePatterns(afterSuppression, context.ignorePatterns ?? []);
  const afterOverrides = applySeverityOverrides(afterIgnore, context.severity ?? {});
  // Approvals run last so an explicit human approval wins over a config severity override.
  return applyApprovals(afterOverrides, context.approvedTestChanges ?? []);
}

type DiffChange = ParsedFile['chunks'][number]['changes'][number];

function effectiveLineOf(change: DiffChange): number {
  if (change.type === 'del' || change.type === 'add') return (change as { ln: number }).ln;
  return (change as { ln2: number }).ln2;
}

/**
 * `proctor-ignore: <ID> reason: ...` suppression. Scoped to the diff chunk containing the
 * flagged line, not just the single line right above it.
 *
 * Only a marker on an unchanged ('normal') context line counts, one that already existed in the
 * base version, before this diff. A marker introduced in the SAME diff as the change it excuses
 * (whether an 'add' line above the flagged code, a few lines away in the same hunk, or an inline
 * trailing comment on the flagged line itself) does NOT suppress. This closes a self-approval
 * loophole: nothing previously distinguished "a human pre-declared this exception" from "the same
 * agent that just made the cheat also typed a plausible-sounding excuse for it in the same
 * breath." Requiring the marker to predate the diff means a genuine exception has to be committed
 * BEFORE the change it justifies, in a prior, separate turn/commit, which a same-commit
 * self-approval can't fabricate after the fact. This is a deliberate behavior change (see
 * README's "Inline suppression" section); it was previously permissive by design and is now
 * strict by design.
 *
 * Still chunk-scoped, not file-scoped: a marker in an unrelated hunk of the same file shouldn't
 * silence a finding it wasn't written for.
 */
function applySuppression(findings: Finding[], files: ParsedFile[]): Finding[] {
  // One path may be repo-relative and the other cwd-relative, so allow a suffix match, but
  // only on a '/' boundary, so `foo.ts` never matches `myfoo.ts`.
  const sameFile = (a: string, b: string): boolean =>
    a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
  return findings.filter(finding => {
    const matchedFile = files.find(f =>
      sameFile(norm(f.to ?? f.from ?? ''), norm(finding.file)),
    );
    if (!matchedFile) return true; // can't locate → keep

    const relevantChunk = matchedFile.chunks.find(chunk =>
      chunk.changes.some(c => {
        const line = effectiveLineOf(c);
        return line === finding.line || line === finding.line - 1;
      }),
    );
    if (!relevantChunk) return true;

    for (const change of relevantChunk.changes) {
      // Only a pre-existing, unchanged context line counts. 'add' means the marker was
      // introduced in this same diff (self-approval, does not suppress). 'del' means the
      // justification was removed (or a pre-planted marker is being used to mask a file
      // deletion). Also does not suppress.
      if (change.type !== 'normal') continue;
      const content = change.content.replace(/^[ +\-]/, '');
      const m = /proctor-ignore:\s*(\S+)\s+reason:\s*(.+)/.exec(content);
      if (m && m[1] === finding.verifierId && m[2]?.trim()) return false; // suppress
    }
    return true; // keep
  });
}

/**
 * `dot: true` on every glob match in this file, and it is load-bearing.
 *
 * micromatch does not match a leading dot with `*` unless told to, so `fixtures/**` silently failed
 * to cover `fixtures/x/.gitignore`, and this repository's own `ignorePatterns` did not do what it
 * plainly says. Nobody noticed until a check started reporting dotfiles, because until then no
 * finding had ever landed on one. The same applies to approvals: `src/**` should approve
 * `src/.eslintrc` too, and an approval that silently does not apply is worse than one that is
 * rejected, since the person who wrote it believes it took effect.
 */
const GLOB_OPTIONS = { dot: true } as const;

function applyIgnorePatterns(findings: Finding[], patterns: string[]): Finding[] {
  if (patterns.length === 0) return findings;
  return findings.filter(f => !micromatch.isMatch(f.file.replace(/\\/g, '/'), patterns, GLOB_OPTIONS));
}

/**
 * Applies `approvedTestChanges` from the committed config.
 *
 * This is the escape hatch for a genuine test change: the test really did need to go, or to be
 * rewritten, and someone decided that on purpose. A matching approval drops the finding to `info`
 * so it stops blocking the commit or the agent turn.
 *
 * It deliberately does NOT drop the finding. An approved finding still prints, still lands in
 * `--json` and `--sarif`, still becomes a PR annotation, and still withholds the honest-pass
 * badge. So the worst an approval can do is make a real cheat non-blocking and fully visible to
 * whoever reviews the change, which is a very different thing from making it disappear. Combined
 * with approvals being read from the committed config, a change cannot quietly approve itself.
 */
function applyApprovals(findings: Finding[], approvals: ApprovedTestChange[]): Finding[] {
  if (approvals.length === 0) return findings;
  return findings.map(f => {
    const path = norm(f.file);
    const match = approvals.find(
      a => a.rule === f.verifierId && (norm(a.file) === path || micromatch.isMatch(path, norm(a.file), GLOB_OPTIONS)),
    );
    if (!match) return f;
    return { ...f, severity: 'info' as Severity, approved: true as const, approvalReason: match.reason };
  });
}

function applySeverityOverrides(findings: Finding[], overrides: Record<string, Severity>): Finding[] {
  if (Object.keys(overrides).length === 0) return findings;
  return findings.map(f => (overrides[f.verifierId] ? { ...f, severity: overrides[f.verifierId]! } : f));
}
