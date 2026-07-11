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

  const visible = ci ? findings.filter(f => f.severity === 'error') : findings;

  // Group visible findings by file
  const byFile = new Map<string, Finding[]>();
  for (const f of visible) {
    const group = byFile.get(f.file);
    if (group) group.push(f);
    else byFile.set(f.file, [f]);
  }

  for (const [file, group] of byFile) {
    out.write(pc.bold(file) + '\n');
    for (const f of group) {
      const badge = f.severity === 'error' ? pc.red('❌') : f.severity === 'warn' ? pc.yellow('⚠️ ') : pc.cyan('ℹ️ ');
      out.write(`  ${badge} ${f.file}:${f.line}  [${f.verifierId}]  ${f.message}\n`);
      out.write(`      ${pc.dim(f.suggestion)}\n`);
    }
  }

  // Summary always uses ALL findings (not just visible)
  const errors = findings.filter(f => f.severity === 'error').length;
  const warns = findings.filter(f => f.severity === 'warn').length;
  const infos = findings.length - errors - warns;
  const total = findings.length;
  const summary = `${total} finding${total !== 1 ? 's' : ''} (${errors} error${errors !== 1 ? 's' : ''}, ${warns} warning${warns !== 1 ? 's' : ''}${infos > 0 ? `, ${infos} info` : ''})\n`;
  if (errors > 0) out.write(pc.red(summary));
  else if (warns > 0) out.write(pc.yellow(summary));
  else out.write(pc.green(summary));
}
