import pc from 'picocolors';
import type { Finding } from '../types.js';

export interface PrettyOptions {
  stream?: { write(s: string): void };
  ci?: boolean;
}

export function prettyReport(findings: Finding[], opts?: PrettyOptions): void {
  const out = opts?.stream ?? process.stdout;
  const ci = opts?.ci ?? false;

  if (findings.length === 0) {
    out.write(pc.green('No findings.\n'));
    return;
  }

  // Approved findings are always shown, including under --ci. The whole point of an approval is
  // that it stops blocking without becoming invisible, so hiding them here would defeat it.
  const visible = ci ? findings.filter(f => f.severity === 'error' || f.approved) : findings;

  const byFile = new Map<string, Finding[]>();
  for (const f of visible) {
    const group = byFile.get(f.file);
    if (group) group.push(f);
    else byFile.set(f.file, [f]);
  }

  for (const [file, group] of byFile) {
    out.write(pc.bold(file) + '\n');
    for (const f of group) {
      const badge = f.approved
        ? pc.cyan('✋')
        : f.severity === 'error' ? pc.red('❌') : f.severity === 'warn' ? pc.yellow('⚠️ ') : pc.cyan('ℹ️ ');
      out.write(`  ${badge} ${f.file}:${f.line}  [${f.verifierId}]  ${f.message}\n`);
      if (f.approved) out.write(`      ${pc.cyan('approved:')} ${f.approvalReason}\n`);
      else out.write(`      ${pc.dim(f.suggestion)}\n`);
    }
  }

  // Summary always uses ALL findings (not just visible)
  const errors = findings.filter(f => f.severity === 'error').length;
  const warns = findings.filter(f => f.severity === 'warn').length;
  const approved = findings.filter(f => f.approved).length;
  const infos = findings.length - errors - warns;
  const total = findings.length;
  const approvedNote = approved > 0 ? `, ${approved} approved` : '';
  const summary = `${total} finding${total !== 1 ? 's' : ''} (${errors} error${errors !== 1 ? 's' : ''}, ${warns} warning${warns !== 1 ? 's' : ''}${infos > 0 ? `, ${infos} info` : ''}${approvedNote})\n`;
  // Point at the fix guidance for whatever actually blocked. A blocked agent otherwise only knows
  // that something was wrong, not what to do instead, which is how a guard turns into a guessing
  // game. One line, only for the rules that fired, only when something is blocking.
  const blockingRules = [...new Set(findings.filter(f => f.severity === 'error').map(f => f.verifierId))].sort();
  if (blockingRules.length > 0) {
    const hint = blockingRules.map(id => `proctor check --explain ${id} --fix`).join('\n  ');
    out.write(pc.dim(`\nHow to fix these honestly:\n  ${hint}\n\n`));
  }

  if (errors > 0) out.write(pc.red(summary));
  else if (warns > 0) out.write(pc.yellow(summary));
  else if (approved > 0) out.write(pc.cyan(summary));
  else out.write(pc.green(summary));
}
