import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import cases from './cases.mjs';
import { makeRepo } from './run.mjs';

if (!process.argv[2]) throw Error('Usage: node bench/dynamic-dev/measure-behavior.mjs BASELINE_CLI [CURRENT_CLI] [BASELINE_COMMIT]');
const baseline = resolve(process.argv[2]), current = resolve(process.argv[3] ?? 'dist/cli.js');
const fixture = cases.find(c => c.id === 'behavior-numeric-sort-node-honest');
const dir = makeRepo(fixture), samples = { baseline: [], current: [] };
try {
  for (let i = 0; i < 25; i++) {
    const order = i % 2 ? [['current', current], ['baseline', baseline]] : [['baseline', baseline], ['current', current]];
    for (const [name, cli] of order) {
      const start = performance.now();
      const r = spawnSync(process.execPath, [cli, 'check', '--dynamic', '--json', '--rules', 'RH014'], { cwd: dir, encoding: 'utf8', timeout: 65_000 });
      const elapsed = performance.now() - start;
      if (r.error || r.status !== 0 || !r.stderr.includes('dynamic: completed') || JSON.parse(r.stdout).length) throw r.error ?? Error(r.stderr);
      if (i >= 5) samples[name].push(elapsed);
    }
  }
  const stat = values => ({ medianMs: [...values].sort((a, b) => a - b)[10], samplesMs: values });
  process.stdout.write(JSON.stringify({ scope: 'Tuned toy fixture cost only: 20 warm CLI runs per revision, interleaved after five warm-ups; two suite runs plus zero or four behavior sweeps.',
    fixture: fixture.id, baselineCommit: process.argv[4] ?? null, baseline: stat(samples.baseline), current: stat(samples.current) }, null, 2) + '\n');
} finally { rmSync(dir, { recursive: true, force: true }); }
