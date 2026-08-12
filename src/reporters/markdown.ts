import type { Finding } from '../types.js';
import { RULE_METADATA } from '../rules.js';

/**
 * Renders findings as a Markdown summary.
 *
 * This exists because the SARIF path only reaches people whose repository has Code Scanning
 * enabled, which on a private repo means paying for Advanced Security. Everyone else got a green
 * check and no explanation of what proctor actually found. Writing this to $GITHUB_STEP_SUMMARY
 * costs nothing and works on every repository, public or private, free or paid.
 */
export function markdownReport(findings: Finding[]): string {
  const errors = findings.filter(f => f.severity === 'error').length;
  const warns = findings.filter(f => f.severity === 'warn').length;
  const approved = findings.filter(f => f.approved).length;

  const lines: string[] = ['## proctor', ''];

  if (findings.length === 0) {
    lines.push('No test tampering found.', '');
    return lines.join('\n');
  }

  const verdict = errors > 0 ? `Caught ${errors} blocking finding${errors !== 1 ? 's' : ''}.` : 'No blocking findings.';
  const counts = [`${errors} error`, `${warns} warning`, `${findings.length - errors - warns} info`];
  if (approved > 0) counts.push(`${approved} approved`);
  lines.push(`${verdict} ${counts.join(', ')}.`, '');

  lines.push('| | Rule | Location | What happened |', '|---|---|---|---|');
  for (const f of findings) {
    // An approved finding shows its reason rather than its suggestion. The point of an approval
    // is that somebody already decided, so a reviewer needs the decision, not the advice.
    const detail = f.approved ? `${f.message} **Approved:** ${f.approvalReason}` : f.message;
    lines.push(
      `| ${icon(f)} | \`${f.verifierId}\` ${RULE_METADATA[f.verifierId]?.name ?? ''} | \`${f.file}\`:${f.line} | ${escapeCell(detail)} |`
    );
  }
  lines.push('');

  // Only the blocking rules get expanded fix guidance. Listing every rule each run turns the
  // summary into a wall nobody reads, and the warnings did not stop the build anyway.
  const blockingRules = [...new Set(findings.filter(f => f.severity === 'error').map(f => f.verifierId))];
  for (const id of blockingRules) {
    const meta = RULE_METADATA[id];
    if (!meta) continue;
    lines.push(`<details><summary>How to fix ${id} honestly</summary>`, '', meta.fix, '', '</details>', '');
  }

  return lines.join('\n');
}

/** An approved finding is labelled by the decision; everything else is labelled by its severity. */
function icon(f: Finding): string {
  return f.approved ? 'approved' : f.severity;
}

/**
 * Pipes and newlines would break out of a table cell, so they are neutralized rather than dropped.
 *
 * Backslashes are escaped first, and that ordering is the whole point: escaping only the pipe
 * turns an input of `\|` into `\\|`, which Markdown reads as an escaped backslash followed by a
 * live cell separator. The escape would then be what broke the table. Findings quote diff content,
 * so this text is attacker-controlled.
 */
function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
