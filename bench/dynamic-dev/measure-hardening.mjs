import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import cases from './hardening-cases.mjs';
import { makeRepo } from './run.mjs';
import { mockJudge } from './judge-mock.mjs';
if (!process.argv[2]) throw Error('Usage: node bench/dynamic-dev/measure-hardening.mjs BASELINE_CLI [CURRENT_CLI]');
const baseline = resolve(process.argv[2]), current = resolve(process.argv[3] ?? 'dist/cli.js');
const root = mkdtempSync(join(tmpdir(), 'proctor-hardening-timing-'));
const fixtures = [];
try {
  for (const id of ['hardening-dy003-source-refactor-cheat', 'hardening-dy006-local-rename-cheat', 'hardening-filename-node-cheat']) {
    const sample = cases.find(c => c.id === id), dir = makeRepo(sample, root), mock = mockJudge(sample);
    const samples = { baseline: [], current: [] };
    try {
      for (let i = 0; i < 13; i++) for (const [label, cli] of (i % 2 ? [['current', current], ['baseline', baseline]] : [['baseline', baseline], ['current', current]])) {
        rmSync(join(dir, '.proctor-judge-cache'), { force: true });
        const start = performance.now();
        const run = spawnSync(process.execPath, [cli, 'check', '--dynamic', '--judge', '--json', '--rules', 'RH014'], { cwd: dir, encoding: 'utf8', timeout: 65_000,
          env: { ...mock.env, TMPDIR: root, TMP: root, TEMP: root } });
        if (run.error || ![0, 2].includes(run.status) || !run.stderr.includes('dynamic: completed')) throw run.error ?? Error(run.stderr);
        const blocks = JSON.parse(run.stdout).filter(f => f.severity === 'error').map(f => f.verifierId);
        const expected = label === 'baseline' && id.includes('filename') ? [] : sample.expectedBlocking;
        if (JSON.stringify(blocks) !== JSON.stringify(expected)) throw Error(`Unexpected blocking evidence: ${id}, ${label}, ${JSON.stringify(blocks)}`);
        if (i >= 3) samples[label].push(performance.now() - start);
      }
      const stat = values => ({ medianMs: [...values].sort((a,b) => a-b)[5], samplesMs: values });
      fixtures.push({ id, baseline: stat(samples.baseline), current: stat(samples.current) });
    } finally { mock.clean(); }
  }
  console.log(JSON.stringify({ scope: 'Tuned toy fixtures, ten warm interleaved CLI samples per revision after three warmups. Cold fake judge where eligible, no service latency or accuracy measured. Includes CLI startup, static checks and dynamic tests.', baselineCommit: 'b979148', fixtures }, null, 2));
} finally { rmSync(root, { recursive: true, force: true }); }
