import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { makeRepo } from './run.mjs';
import { mockJudge } from './judge-mock.mjs';
import cases from './judge-cases.mjs';
export function checkJudge(sample) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'proctor-judge-case-'));
  const dir = makeRepo(sample, temporaryRoot), mock = mockJudge(sample), start = performance.now();
  const env = { ...mock.env, TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot };
  try {
    const args = ['check', '--json', '--rules', sample.rules ?? 'RH014'];
    if (sample.gate !== 'no-dynamic') args.push('--dynamic');
    if (sample.gate !== 'no-judge') args.push('--judge');
    const run = spawnSync(process.execPath, [resolve('dist/cli.js'), ...args], { cwd: dir, env, encoding: 'utf8', timeout: 65_000 });
    if (run.error) throw run.error;
    const all = JSON.parse(run.stdout), findings = all.filter(f => f.verifierId.startsWith('DY'));
    if (sample.expectedStatic && !all.some(f => f.verifierId === sample.expectedStatic && f.severity === 'error')) throw Error('Expected static blocker was absent');
    return { id: sample.id, label: sample.label, gate: sample.gate, expected: sample.expected, expectedBlocking: sample.expectedBlocking, expectedAdvisory: sample.expectedAdvisory ?? [],
      exitCode: run.status, found: findings.map(f => f.verifierId), advisory: findings.filter(f => f.severity === 'warn').map(f => f.verifierId), blocking: findings.filter(f => f.severity === 'error').map(f => f.verifierId),
      elapsedMs: performance.now() - start, skipped: run.stderr.includes('dynamic: skipped'), cache: existsSync(join(dir, '.proctor-judge-cache')),
      stderr: run.stderr.split(process.execPath).join('node') };
  } finally { mock.clean(); rmSync(temporaryRoot, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = [];
  for (const sample of cases) { const row = checkJudge(sample); rows.push(row); process.stderr.write(`${row.id}: ${row.found.join(',') || 'silent'}\n`); }
  const cheats = rows.filter(r => r.label === 'cheat'), honest = rows.filter(r => r.label === 'honest');
  const result = { corpus: 'Authored and tuned, mocked local CLI verdicts. No real service or model accuracy measured.', total: rows.length,
    cheats: cheats.length, blockedCheats: cheats.filter(r => r.blocking.length).length, honest: honest.length, blockedHonest: honest.filter(r => r.blocking.length).length,
    flaggedHonest: honest.filter(r => r.found.length).length, skipped: rows.filter(r => r.skipped).length,
    medianCliMs: rows.map(r => r.elapsedMs).sort((a,b)=>a-b)[Math.floor(rows.length/2)], totalCliMs: rows.reduce((n,r)=>n+r.elapsedMs,0), rows };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (rows.some(r => r.skipped || r.expected.length !== r.found.length || r.expected.some(id => !r.found.includes(id)) || r.expectedBlocking.length !== r.blocking.length || r.expectedBlocking.some(id => !r.blocking.includes(id)) || r.expectedAdvisory.some(id => !r.advisory.includes(id)) || !r.expected.length && r.found.length || r.label === 'honest' && r.blocking.length)) process.exitCode = 1;
}
