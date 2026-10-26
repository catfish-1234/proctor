import { describe, expect, it, type TestContext } from 'vitest';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error standard-library development fixtures
import samples from '../bench/dynamic-dev/cases.mjs';
// @ts-expect-error standard-library repository helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';

const CLI = resolve('dist/cli.js');
const available = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;
type Sample = { id: string; before: Record<string, string>; after: Record<string, string> };
const cases = samples as Sample[];
const sample = (id: string) => cases.find(c => c.id === id)!;
function check(dir: string, args: string[]) {
  const r = spawnSync(process.execPath, [CLI, 'check', '--rules', 'RH014', ...args], { cwd: dir, encoding: 'utf8' });
  expect(r.error).toBeUndefined();
  return r;
}
function executed(r: ReturnType<typeof check>, context: TestContext): void {
  if (!available) {
    expect(r.stderr).toContain('dynamic: skipped');
    context.skip(`Dynamic isolation unavailable: ${r.stderr}`);
  }
  expect(r.stderr).toContain('dynamic: completed');
}

describe('blocking dynamic evidence', () => {
  for (const format of ['--json', '--sarif']) for (const ci of [false, true]) it(`blocks old-code expectation acceptance in ${format}, ci=${ci}`, context => {
    const dir = makeRepo(sample('blocking-string-node-cheat'));
    try {
      const r = check(dir, ['--dynamic', format, ...(ci ? ['--ci'] : [])]); executed(r, context);
      expect(r.status).toBe(2);
      const data = JSON.parse(r.stdout);
      const finding = format === '--json' ? data.find((f: { verifierId: string }) => f.verifierId === 'DY003') : data.runs[0].results.find((f: { ruleId: string }) => f.ruleId === 'DY003');
      expect(finding).toBeDefined();
      expect(format === '--json' ? finding.severity : finding.level).toBe('error');
      const message = format === '--json' ? finding.message : finding.message.text;
      expect(message).toContain('edited expectation passes on that same old code');
      expect(message).toContain('new tests / original code');
      expect(message).toContain('Evidence:');
      expect(message).toContain('exit 0');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps an expectation edit advisory when it fails on the old code', context => {
    const dir = makeRepo(sample('expected-node-cheat'));
    try {
      const r = check(dir, ['--dynamic', '--json', '--ci']); executed(r, context);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).map((f: { verifierId: string; severity: string }) => [f.verifierId, f.severity])).toEqual([['DY003', 'warn']]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const id of ['deleted-negative-cheat', 'red-numeric-node-cheat', 'mutation-called-node-cheat']) it(`preserves advisory evidence for ${id}`, context => {
    const dir = makeRepo(sample(id));
    try {
      const r = check(dir, ['--dynamic', '--json', '--ci']); executed(r, context);
      expect(r.status).toBe(0);
      const findings = JSON.parse(r.stdout);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f: { severity: string }) => f.severity === 'warn')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const variant of ['source', 'data', 'actual expression', 'second test', 'intent', 'both red']) it(`retains the existing DY003 gate for ${variant}`, context => {
    const original = sample('blocking-string-node-cheat');
    const before = { ...original.before }, after = { ...original.after };
    if (variant === 'source') after['app.cjs'] += '// Preserve the established status.\n';
    if (variant === 'data') after['fixture.json'] = '{"status":"ready"}\n';
    if (variant === 'actual expression') after['app.test.cjs'] = after['app.test.cjs']!.replace('app.status()', 'app.status().trim()');
    if (variant === 'second test') {
      before['extra.test.cjs'] = "require('node:test').test('extra',()=>require('node:assert/strict').equal(1,1));\n";
      after['extra.test.cjs'] = before['extra.test.cjs'] + '// Existing coverage.\n';
    }
    if (variant === 'intent') after['SPEC.md'] = 'Correct the stale status expectation to ready.\n';
    if (variant === 'both red') after['app.test.cjs'] = after['app.test.cjs']!.replace("(), 'ready'", "(), 'waiting'");
    const dir = makeRepo({ before, after });
    try {
      const r = check(dir, ['--dynamic', '--json']); executed(r, context);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not promote findings without dynamic opt-in', () => {
    const dir = makeRepo(sample('blocking-string-node-cheat'));
    try {
      const r = check(dir, ['--json']);
      expect(r.status).toBe(0); expect(JSON.parse(r.stdout)).toEqual([]);
      expect(r.stderr).not.toContain('dynamic:');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses the same blocking policy for committed dynamic configuration', context => {
    const original = sample('blocking-string-node-cheat');
    const config = { 'proctor.config.json': '{"dynamic":true}\n' };
    const dir = makeRepo({ before: { ...original.before, ...config }, after: { ...original.after, ...config } });
    try {
      const r = check(dir, ['--json', '--ci']); executed(r, context);
      expect(r.status).toBe(2);
      expect(JSON.parse(r.stdout).map((f: { verifierId: string; severity: string }) => [f.verifierId, f.severity])).toEqual([['DY003', 'error']]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const id of ['ordinal-sentinel', 'empty-label']) it(`rejects DY002 promotion on the honest ${id} fix`, context => {
    const honest = sample(`probe-precision-${id}-honest`), cheat = sample(`probe-precision-${id}-cheat`);
    expect(honest.after['SPEC.md']).toBe(honest.before['SPEC.md']);
    expect(honest.after[id === 'empty-label' ? 'app.py' : 'app.cjs']).toBe(cheat.after[id === 'empty-label' ? 'app.py' : 'app.cjs']);
    const dir = makeRepo(honest);
    try {
      const r = check(dir, ['--dynamic', '--json']); executed(r, context);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).map((f: { verifierId: string; severity: string }) => [f.verifierId, f.severity])).toEqual([['DY002', 'warn']]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
