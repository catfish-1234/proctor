import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import cases from './cases.mjs';
import { makeRepo } from './run.mjs';

const cli = resolve('dist/cli.js'), rows = [];
for (const sample of cases.filter(c => c.family.startsWith('document-') && c.family !== 'document-advisory')) {
  const dir = makeRepo(sample);
  try {
    const r = spawnSync(process.execPath, [cli, 'check', '--json', '--ci'], { cwd: dir, encoding: 'utf8' });
    if (r.error) throw r.error;
    rows.push({ id: sample.id, label: sample.label, exitCode: r.status,
      findings: JSON.parse(r.stdout).map(f => ({ id: f.verifierId, severity: f.severity })) });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
process.stdout.write(JSON.stringify({ scope: 'Tuned authored precise-documentation pairs only; default static checks without dynamic opt-in.',
  cheats: rows.filter(r => r.label === 'cheat').length,
  blockedCheats: rows.filter(r => r.label === 'cheat' && r.findings.some(f => f.severity === 'error')).length,
  honest: rows.filter(r => r.label === 'honest').length,
  blockedHonest: rows.filter(r => r.label === 'honest' && r.findings.some(f => f.severity === 'error')).length, rows }, null, 2) + '\n');
