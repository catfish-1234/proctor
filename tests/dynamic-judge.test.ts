import { afterAll, beforeAll, describe, expect, it, vi, type TestContext } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildContext } from '../src/context/index.js';
import { documentationSentences, documentationRules } from '../src/dynamic/documentation.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';
// @ts-expect-error standard-library tuned fixtures
import cases from '../bench/dynamic-dev/judge-cases.mjs';
// @ts-expect-error standard-library repository helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';
// @ts-expect-error fake CLI helper, never a real service
import { mockJudge } from '../bench/dynamic-dev/judge-mock.mjs';
// @ts-expect-error standard-library isolated driver
import { checkJudge } from '../bench/dynamic-dev/judge-run.mjs';
type Sample = { id: string; gate?: string; before: Record<string, string>; after: Record<string, string>; verdict: unknown; expected: string[]; expectedBlocking: string[]; expectedAdvisory?: string[] };
let suiteTemp: string;
beforeAll(() => {
  suiteTemp = mkdtempSync(join(tmpdir(), 'proctor-judge-suite-'));
  // Keep this file's subprocesses separate from global scratch-cleanup tests in other files.
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(key, suiteTemp);
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(suiteTemp, { recursive: true, force: true }); });
const rows = cases as Sample[];
const sample = rows.find(c => c.id === 'judge-ascending-node-cheat')!;
const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([file, source]) => [file, { data: Buffer.from(source), mode: 0o644 }]));
const available = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;
function runnable(context: TestContext) { if (!available) context.skip('Dynamic checks require Linux and working bubblewrap namespaces.'); }
function check(dir: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  const run = spawnSync(process.execPath, [resolve('dist/cli.js'), 'check', '--dynamic', '--judge', '--json', '--rules', 'RH014', ...args], { cwd: dir, env, encoding: 'utf8', timeout: 65_000 });
  expect(run.error).toBeUndefined();
  return { ...run, findings: JSON.parse(run.stdout) as { verifierId: string; severity: string; message: string }[] };
}
describe('judged documentation selection and configuration', () => {
  it('reuses local prose extraction without treating unknown wording as a deterministic contract', () => {
    const old = tree(sample.before), next = tree(sample.after);
    expect(documentationRules(old, next)).toEqual([]);
    expect(documentationSentences(old, next)).toMatchObject([{ name: 'compute', module: 'app', arity: 1, quote: sample.before['README.md']!.trim() }]);
    next.get('README.md')!.mode = 0o755;
    expect(documentationSentences(old, next)).toEqual([]);
  });
  it('ignores fenced, quoted, commented, historical and unrelated prose', () => {
    const quote = sample.before['README.md']!;
    for (const text of ['```\n' + quote + '```\n', '> ' + quote, '<!--\n' + quote + '-->', '# Historical\n' + quote, 'Another unit preserves width.']) {
      const snapshot = tree({ 'README.md': text }); expect(documentationSentences(snapshot, snapshot)).toEqual([]);
    }
  });
  it('uses literal identifier mentions without stripping longer module qualifiers', () => {
    const names = new Set(['compute']);
    const plain = tree({ 'README.md': 'The app.compute function keeps its Unicode character count.' });
    expect(documentationSentences(plain, plain, names)).toMatchObject([{ name: 'compute', module: 'app' }]);
    const other = tree({ 'README.md': 'The other.api.compute function keeps its Unicode character count.' });
    expect(documentationSentences(other, other, names)).toEqual([]);
  });
  it('uses the committed backend selection and ignores an uncommitted change', async () => {
    const dir = makeRepo(sample);
    try {
      writeFileSync(join(dir, 'proctor.config.json'), '{"judge":{"cli":"claude"}}');
      const ctx = await buildContext(dir, [], { configRef: 'HEAD', quiet: true });
      expect(ctx.judgeCli).toBe('gemini');
      expect(ctx.judge).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('rejects arbitrary commands in judge.cli', async () => {
    const bad = { ...sample, before: { ...sample.before, 'proctor.config.json': '{"judge":{"cli":"sh -c anything"}}' } };
    const dir = makeRepo(bad);
    try { expect((await buildContext(dir, [], { configRef: 'HEAD', quiet: true })).judgeCli).toBeUndefined(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
describe('judged documentation runtime gates with fake commands', () => {
  for (const row of rows) it(row.id, context => {
    runnable(context);
    const result = checkJudge(row);
    expect(result.skipped, result.stderr).toBe(false);
    expect(result.found, result.stderr).toEqual(row.expected);
    expect(result.blocking, result.stderr).toEqual(row.expectedBlocking);
    if (row.expectedAdvisory?.length) expect(result.exitCode).toBe(0);
    if (row.expectedBlocking.length) expect(result.exitCode).toBe(2);
    if (row.gate && ['no-judge', 'no-dynamic', 'changed-doc', 'no-doc', 'red-current', 'malformed', 'unsupported', 'unsigned', 'missing', 'oversized', 'foreign-unit'].includes(row.gate)) expect(result.cache).toBe(false);
  }, 65_000);
  it('retains the quote, actual process commands and stable runtime witness', context => {
    runnable(context); const dir = makeRepo(sample), mock = mockJudge(sample);
    try {
      const result = check(dir, mock.env);
      expect(result.status).toBe(2); expect(result.stderr).toContain('dynamic: completed');
      const finding = result.findings.find(f => f.verifierId === 'DY009')!;
      expect(finding.message).toContain(sample.before['README.md']!.trim());
      expect(finding.message).toContain('before'); expect(finding.message).toContain('after');
      expect(finding.message).toContain('fresh processes'); expect(finding.message).toContain('.proctor-sweep.mjs');
      expect(finding.message).toContain('gemini');
    } finally { mock.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 65_000);
  it('repeats runtime verification from a persisted cache without a working login', context => {
    runnable(context); const dir = makeRepo(sample), mock = mockJudge(sample), unsigned = mockJudge({ ...sample, gate: 'unsigned' });
    try {
      const first = check(dir, mock.env); expect(first.status).toBe(2);
      const cache = readFileSync(join(dir, '.proctor-judge-cache'), 'utf8');
      const second = check(dir, unsigned.env); expect(second.status).toBe(2);
      expect(second.findings[0]!.message).toContain('content-hash cache hit');
      expect(readFileSync(join(dir, '.proctor-judge-cache'), 'utf8')).toBe(cache);
      rmSync(join(dir, '.proctor-judge-cache'));
      expect(check(dir, unsigned.env).findings).toEqual([]);
      expect(readFileSync(join(dir, 'app.cjs'), 'utf8')).toBe(sample.after['app.cjs']);
    } finally { mock.clean(); unsigned.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 65_000);
  for (const cli of ['claude', 'codex'] as const) it(`uses the selected ${cli} command through a fake executable`, context => {
    runnable(context);
    const config = JSON.stringify({ judge: { cli } });
    const selected = { ...sample, before: { ...sample.before, 'proctor.config.json': config }, after: { ...sample.after, 'proctor.config.json': config } };
    const dir = makeRepo(selected), mock = mockJudge(selected);
    try {
      const result = check(dir, mock.env); expect(result.status).toBe(2);
      expect(result.findings[0]!.message).toContain(`Judge ${cli}`);
    } finally { mock.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 65_000);
  it('keeps the overall deadline while the fake command is stalled', context => {
    runnable(context); const dir = makeRepo(sample), mock = mockJudge(sample);
    try {
      writeFileSync(join(mock.bin, 'gemini'), `#!${process.execPath}\nsetInterval(()=>{},1000);\n`);
      const start = Date.now();
      const result = check(dir, mock.env, ['--dynamic-timeout', '2000']);
      expect(result.status).toBe(0); expect(result.findings).toEqual([]);
      // The command's remaining-budget timer can finish silently just before the overall timer.
      expect(result.stderr).toMatch(/dynamic: (?:completed|skipped, overall timeout \(2000ms\))/);
      expect(Date.now()-start).toBeGreaterThanOrEqual(1800);
      expect(Date.now()-start).toBeLessThan(6000);
      expect(existsSync(join(dir, '.proctor-judge-cache'))).toBe(false);
    } finally { mock.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 10_000);
  it('does not enable the judge from dynamic configuration without the dynamic flag', context => {
    runnable(context);
    const config = '{"dynamic":true,"judge":{"cli":"gemini"}}';
    const configured = { ...sample, before: { ...sample.before, 'proctor.config.json': config }, after: { ...sample.after, 'proctor.config.json': config } };
    const dir = makeRepo(configured), mock = mockJudge(configured);
    try {
      const result = spawnSync(process.execPath, [resolve('dist/cli.js'), 'check', '--judge', '--json', '--rules', 'RH014'], { cwd: dir, env: mock.env, encoding: 'utf8', timeout: 65_000 });
      expect(result.error).toBeUndefined(); expect(result.stderr).toContain('dynamic: completed');
      expect(JSON.parse(result.stdout)).toEqual([]); expect(existsSync(join(dir, '.proctor-judge-cache'))).toBe(false);
    } finally { mock.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 65_000);
  it('does not call the judge when a deterministic dynamic finding already blocks', context => {
    runnable(context);
    const doc = '`app.compute(xs)` must return all input integers in ascending order, preserving duplicates.\n';
    const fixed = { ...sample, before: { ...sample.before, 'README.md': doc }, after: { ...sample.after, 'README.md': doc } };
    const dir = makeRepo(fixed), mock = mockJudge(fixed);
    try {
      const result = check(dir, mock.env); expect(result.findings.map(f => f.verifierId)).toContain('DY008');
      expect(result.findings.map(f => f.verifierId)).not.toContain('DY009');
      expect(existsSync(join(dir, '.proctor-judge-cache'))).toBe(false);
    } finally { mock.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 65_000);
  it('does not call the judge when a static finding already blocks', context => {
    runnable(context);
    const fixed = { ...sample, after: { ...sample.after, 'app.test.cjs': sample.after['app.test.cjs'] + "test.skip('omitted',()=>{assert.equal(app.compute([3,1]),[1,3]);});\n" } };
    const dir = makeRepo(fixed), mock = mockJudge(fixed);
    try {
      const result = check(dir, mock.env, ['--rules', 'RH003']);
      expect(result.findings.some(f => f.severity === 'error')).toBe(true);
      expect(result.findings.some(f => f.verifierId === 'DY009')).toBe(false);
      expect(existsSync(join(dir, '.proctor-judge-cache'))).toBe(false);
    } finally { mock.clean(); rmSync(dir, { recursive: true, force: true }); }
  }, 65_000);
});
