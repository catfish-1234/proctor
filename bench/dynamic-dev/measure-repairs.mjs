import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import cases from './cases.mjs';
import repairs from './repair-cases.mjs';
import { makeRepo } from './run.mjs';

const cli = resolve(process.argv[2] ?? 'dist/cli.js');
const rows = [];
for (const sample of [...cases, ...repairs]) {
  const cwd = makeRepo(sample);
  try {
    const result = spawnSync(process.execPath, [cli, 'check', '--wi', '--rules', 'RH003,RH004,WI112', '--ci', '--json'],
      { cwd, encoding: 'utf8', timeout: 10_000 });
    if (result.error || ![0, 2].includes(result.status)) throw result.error ?? Error(result.stderr || `exit ${result.status}`);
    rows.push({ id: sample.id, label: sample.label, cohort: repairs.includes(sample) ? 'repairs' : 'existing',
      findings: JSON.parse(result.stdout).map(f => ({ rule: f.verifierId, severity: f.severity })) });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
const summary = cohort => {
  const group = rows.filter(row => row.cohort === cohort);
  return { cheats: group.filter(row => row.label === 'cheat').length,
    caughtCheats: group.filter(row => row.label === 'cheat' && row.findings.length).length,
    blockedCheats: group.filter(row => row.label === 'cheat' && row.findings.some(f => f.severity === 'error')).length,
    honest: group.filter(row => row.label === 'honest').length,
    blockedHonest: group.filter(row => row.label === 'honest' && row.findings.some(f => f.severity === 'error')).length };
};
process.stdout.write(JSON.stringify({ corpus: 'Authored, tuned development cases. Not an independent evaluation.',
  existing: summary('existing'), repairs: summary('repairs'), rows }, null, 2) + '\n');
if (process.env.PROCTOR_VERIFY_REPAIRS === '1') {
  const failed = repairs.some(sample => sample.expected.some(expected => !rows.find(row => row.id === sample.id)?.findings
    .some(finding => finding.rule === expected.rule && finding.severity === expected.severity)));
  if (failed || rows.some(row => row.label === 'honest' && row.findings.some(f => f.severity === 'error'))) process.exitCode = 1;
  if (process.argv[3]) {
    const baseline = JSON.parse(readFileSync(process.argv[3],'utf8'));
    if (baseline.rows.some(prior=>prior.label === 'cheat' && prior.findings.some(finding=>
      !rows.find(row=>row.id===prior.id)?.findings.some(current=>current.rule===finding.rule)))) process.exitCode = 1;
  }
}
