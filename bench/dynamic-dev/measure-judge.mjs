import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import cases from './judge-cases.mjs';
import { makeRepo } from './run.mjs';
import { mockJudge } from './judge-mock.mjs';
const sample = cases.find(c => c.id === 'judge-ascending-node-honest');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'proctor-judge-timing-'));
const dir = makeRepo(sample, temporaryRoot), mock = mockJudge(sample), cache = join(dir, '.proctor-judge-cache');
const env = { ...mock.env, TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot };
const samples = { withoutJudge: [], coldJudge: [], cachedJudge: [] };
try {
  for (let i = 0; i < 25; i++) for (const name of ['withoutJudge', 'coldJudge', 'cachedJudge']) {
    if (name === 'coldJudge') rmSync(cache, { force: true });
    if (name === 'cachedJudge' && !existsSync(cache)) throw Error('Cold verdict was not cached');
    const start = performance.now();
    const run = spawnSync(process.execPath, [resolve('dist/cli.js'), 'check', '--dynamic', '--json', '--rules', 'RH014', ...(name === 'withoutJudge' ? [] : ['--judge'])],
      { cwd: dir, env, encoding: 'utf8', timeout: 65_000 });
    if (run.error || run.status !== 0 || JSON.parse(run.stdout).length || !run.stderr.includes('dynamic: completed')) throw run.error ?? Error(run.stderr);
    if (i >= 5) samples[name].push(performance.now() - start);
  }
  const stat = x => ({ medianMs: [...x].sort((a,b)=>a-b)[10], samplesMs: x });
  console.log(JSON.stringify({ scope: 'Tuned toy sort fixture, fake local command only. No service latency or accuracy measured. Twenty warm samples per mode after five warmups; repeated order without judge, cold proposal, cached proposal. All modes include CLI startup, static checks and dynamic tests.',
    fixture: sample.id, withoutJudge: stat(samples.withoutJudge), coldJudge: stat(samples.coldJudge), cachedJudge: stat(samples.cachedJudge) }, null, 2));
} finally { mock.clean(); rmSync(temporaryRoot, { recursive: true, force: true }); }
