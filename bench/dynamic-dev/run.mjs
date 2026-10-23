import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import cases from './cases.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function writeTree(dir, files, previous = {}) {
  for (const path of Object.keys(previous)) if (!(path in files)) rmSync(join(dir, path), { force: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text);
  }
}
export function makeRepo(sample, temporaryRoot = tmpdir()) {
  const dir = mkdtempSync(join(temporaryRoot, 'proctor-dynamic-dev-'));
  for (const args of [['init', '-q'], ['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.com']]) {
    const r = spawnSync('git', args, { cwd: dir }); if (r.status !== 0 || r.error) throw r.error ?? Error('git setup failed');
  }
  writeTree(dir, sample.before);
  spawnSync('git', ['add', '.'], { cwd: dir }); spawnSync('git', ['commit', '-qm', 'Initial'], { cwd: dir });
  writeTree(dir, sample.after, sample.before);
  return dir;
}
export function checkCase(sample, args = []) {
  const dir = makeRepo(sample);
  const started = performance.now();
  try {
    const r = spawnSync(process.execPath, [join(root, 'dist/cli.js'), 'check', '--dynamic', '--json', '--rules', 'RH014', ...args], { cwd: dir, encoding: 'utf8', timeout: 65_000 });
    if (r.error) throw r.error;
    const findings = JSON.parse(r.stdout).filter(f => f.verifierId.startsWith('DY'));
    return { id: sample.id, label: sample.label, family: sample.family, expected: sample.expected,
      expectedBlocking: sample.expectedBlocking ?? [], expectedAdvisory: sample.expectedAdvisory ?? [], exitCode: r.status,
      found: findings.map(f => f.verifierId), blocking: findings.filter(f => f.severity === 'error').map(f => f.verifierId),
      advisory: findings.filter(f => f.severity === 'warn').map(f => f.verifierId),
      skipped: r.stderr.includes('dynamic: skipped'), elapsedMs: performance.now() - started, stderr: r.stderr.split(process.execPath).join('node') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = [];
  for (const sample of cases) {
    const row = checkCase(sample); rows.push(row);
    process.stderr.write(`${row.id}: ${row.skipped ? 'skipped' : row.found.join(',') || 'silent'}\n`);
  }
  const cheats = rows.filter(r => r.label === 'cheat'), honest = rows.filter(r => r.label === 'honest');
  const restoration = [];
  for (const sample of cases.filter(c => c.family === 'mutation')) {
    const dir = makeRepo(sample);
    try {
      // Restore only the removed implementation guard, leaving the new tests in place.
      writeFileSync(join(dir, 'app.cjs'), sample.before['app.cjs']);
      const r = spawnSync('bwrap', ['--die-with-parent', '--unshare-net', '--unshare-pid', '--ro-bind', '/', '/', '--bind', dir, dir,
        '--proc', '/proc', '--dev', '/dev', '--chdir', dir, '--', process.execPath, '--test', '--test-reporter=tap', 'app.test.cjs'],
        { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, NO_COLOR: '1' } });
      restoration.push({ id: sample.id, label: sample.label, command: 'node --test --test-reporter=tap app.test.cjs (guard restored)',
        exitCode: r.status, namedFailure: /not ok \d+ - (.+)/.exec(r.stdout)?.[1] ?? null });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const summary = { restoration, corpus: 'Authored, tuned development set. Not a held-out evaluation.', total: rows.length,
    cheats: cheats.length, detectedCheats: cheats.filter(r => r.found.length).length,
    honest: honest.length, flaggedHonest: honest.filter(r => r.found.length).length,
    blockedCheats: cheats.filter(r => r.blocking.length).length, blockedHonest: honest.filter(r => r.blocking.length).length,
    dy002Promotion: { scope: 'Project the same observed DY002 findings to errors; no test or input changes.',
      blockedCheats: cheats.filter(r => r.blocking.length || r.found.includes('DY002')).length,
      blockedHonest: honest.filter(r => r.blocking.length || r.found.includes('DY002')).length },
    dy007Promotion: { scope: 'Project observed DY007 sweeps to errors without a declared contract; tuned counterfactual.',
      blockedCheats: cheats.filter(r => r.blocking.length || r.found.includes('DY007')).length,
      blockedHonest: honest.filter(r => r.blocking.length || r.found.includes('DY007')).length },
    dy008Promotion: { scope: 'Project ambiguous DY008 warnings to errors; tuned severity-only counterfactual.',
      blockedCheats: cheats.filter(r => r.blocking.length || r.found.includes('DY008')).length,
      blockedHonest: honest.filter(r => r.blocking.length || r.found.includes('DY008')).length },
    skipped: rows.filter(r => r.skipped).length,
    medianCliMs: rows.map(r => r.elapsedMs).sort((a,b) => a-b)[Math.floor(rows.length/2)],
    totalCliMs: rows.reduce((n,r) => n+r.elapsedMs, 0), rows };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (rows.some(r => r.skipped || r.expected.some(id => !r.found.includes(id)) || r.expectedBlocking.some(id => !r.blocking.includes(id)) ||
    r.expectedAdvisory.some(id => !r.advisory.includes(id)) ||
    (r.label === 'honest' && (r.blocking.length || r.found.some(id => !r.expectedAdvisory.includes(id)))))) process.exitCode = 1;
}
