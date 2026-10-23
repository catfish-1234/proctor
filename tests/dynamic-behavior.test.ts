import { describe, expect, it, type TestContext } from 'vitest';
import { spawnSync } from 'node:child_process';
import { rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { behaviorUnits, classifyBehavior, sweepInputs, SWEEP_LIMIT, UNIT_LIMIT, type BehaviorUnit, type Sweep } from '../src/dynamic/behavior.js';
import { parseBehaviorJs, parseBehaviorPython } from '../src/dynamic/behavior-parse.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';
// @ts-expect-error standard-library development fixtures
import samples from '../bench/dynamic-dev/cases.mjs';
// @ts-expect-error standard-library repository helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';

type Sample = { id: string; before: Record<string, string>; after: Record<string, string> };
const sample = (id: string): Sample => samples.find((s: Sample) => s.id === id);
const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([p, s]) => [p, { data: Buffer.from(s), mode: 0o644 }]));
const isTest = (p: string) => p.includes('.test.') || p.startsWith('test_');
const CLI = resolve('dist/cli.js');
const available = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;
function check(c: Sample, args: string[], context: TestContext) {
  const dir = makeRepo(c);
  try {
    const source = Object.keys(c.after).find(p => !isTest(p))!;
    const original = readFileSync(join(dir, source), 'utf8');
    const r = spawnSync(process.execPath, [CLI, 'check', '--rules', 'RH014', '--json', ...args], { cwd: dir, encoding: 'utf8' });
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(dir, source), 'utf8')).toBe(original);
    if (args.includes('--dynamic')) {
      if (!available) {
        expect(r.stderr).toContain('dynamic: skipped');
        context.skip(`Dynamic isolation unavailable: ${r.stderr}`);
      }
      expect(r.stderr).toContain('dynamic: completed');
    }
    return { ...r, findings: JSON.parse(r.stdout) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('bounded behavior input mining', () => {
  it('perturbs numeric boundaries, strings, booleans, collections and offsets without changing types', () => {
    const numeric = sweepInputs([[2]]).flat();
    expect(numeric).toEqual(expect.arrayContaining([0, -1, 1, 3, -2, 2147483647, -2147483648]));
    expect(sweepInputs([['abc']]).flat()).toEqual(expect.arrayContaining(['', 'a', 'abcabc', ' abc', 'abcdefgh']));
    expect(sweepInputs([[true]])).toEqual([[true], [false]]);
    const collections = sweepInputs([[[2, 3], 0]]);
    expect(collections).toContainEqual([[], 0]);
    expect(collections).toContainEqual([[10, 2], 0]);
    expect(collections).toContainEqual([[3, 2], 0]);
    expect(collections).toContainEqual([[2, 3], -1]);
    expect(collections.length).toBeLessThanOrEqual(SWEEP_LIMIT);
    expect(new Set(collections.map(v => JSON.stringify(v))).size).toBe(collections.length);
    expect(sweepInputs([[[]]])).toEqual([[[]]]);
  });
  it('mines only parser-confirmed exports and resolves namespace and named import aliases', () => {
    const before = { 'app.mjs': 'export function sum(xs) { return xs.reduce((a,b)=>a+b,0); }\n',
      'app.test.mjs': "import {sum as total} from './app.mjs';\nconst x=total([2,-3]);\n" };
    const after = { ...before, 'app.mjs': 'export function sum(xs) { return xs.length; }\nfunction hidden(x) { return x; }\n' };
    const units = behaviorUnits(tree(before), tree(after), isTest, process.cwd());
    expect(units).toHaveLength(1); expect(units[0]!.name).toBe('sum'); expect(units[0]!.fixtures).toEqual([[[2, -3]]]);
    expect(parseBehaviorJs('bad.js', 'export ???')).toBeUndefined();
    expect(parseBehaviorJs('app.js', 'const f=(x=2)=>x;')!.functions).toEqual([]);
  });
  it('does not treat strings as contracts, follow unrelated modules or guess dynamic inputs', () => {
    const before = { 'app.cjs': 'exports.f=x=>x;\n', 'app.test.cjs': "const other=require('./other.cjs');\nconst note='// proctor:contract check';\nother.f(2);\n" };
    expect(behaviorUnits(tree(before), tree({ ...before, 'app.cjs': 'exports.f=x=>-x;\n' }), isTest, process.cwd())).toEqual([]);
    expect(parseBehaviorJs('x.cjs', before['app.test.cjs'])!.contracts).toEqual([]);
    expect(parseBehaviorJs('x.cjs', 'const note=`\n// proctor:contract verify\n`;')!.contracts).toEqual([]);
  });
  it('caps units and skips added functions, signature changes and unsupported syntax', () => {
    const source = (suffix: string) => Array.from({ length: 8 }, (_, i) => `exports.f${i}=x=>x${suffix};`).join('\n');
    const tests = "const app=require('./app.cjs');\n" + Array.from({ length: 8 }, (_, i) => `app.f${i}(2);`).join('\n');
    expect(behaviorUnits(tree({ 'app.cjs': source('') }), tree({ 'app.cjs': source('+1'), 'app.test.cjs': tests }), isTest, process.cwd())).toHaveLength(UNIT_LIMIT);
    expect(behaviorUnits(tree({ 'app.cjs': 'exports.f=x=>x;' }), tree({ 'app.cjs': 'exports.f=(x,y)=>x+y;', 'app.test.cjs': "const app=require('./app.cjs');app.f(2,3);" }), isTest, process.cwd())).toEqual([]);
  });
  it('uses Python ASTs for module functions, negative literals and aliases', context => {
    const r = spawnSync('python3', ['--version']);
    if (r.status !== 0) context.skip('Python 3 is unavailable');
    const parsed = parseBehaviorPython([['test_app.py', 'from app import scale as f\ndef verify(x):\n    assert f(x) == x\nf(-2)\n']], process.cwd());
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.calls).toContainEqual(expect.objectContaining({ name: 'f', args: [-2] }));
    expect(parsed[0]!.imports).toContainEqual({ local: 'f', module: 'app', member: 'scale' });
    expect(parseBehaviorPython([['bad.py', 'def !']], process.cwd())).toEqual([]);
    expect(parseBehaviorPython([['x.py', 'text="""\n# proctor:contract verify\n"""\n']], process.cwd())[0]!.contracts).toEqual([]);
  });
});

describe('behavior gate precision', () => {
  const unit: BehaviorUnit = { file: 'app.cjs', name: 'f', language: 'js', line: 1, fixtures: [[1], [2]], inputs: [[1], [2], [3], [4], [5]],
    contract: { file: 'app.test.cjs', name: 'verify', source: '', preamble: '' } };
  const sweep = (values: number[], contract: 'pass' | 'assertion' | 'error' = 'pass'): Sweep => ({
    outcomes: values.map((value, i) => ({ value, contract: i > 1 ? contract : 'pass' })),
    run: { label: 'test', command: 'test', exitCode: 0, passed: [], failed: [], detail: '' } });
  it('blocks only stable assertion violations outside fixtures with an explicit oracle', () => {
    const old = sweep([1, 2, 3, 4, 5]), next = sweep([1, 2, 0, 0, 0], 'assertion');
    expect(classifyBehavior(unit, [old, old, next, next])[0]!.kind).toBe('contract');
    expect(classifyBehavior(unit, [old, old, next])).toEqual([]);
    expect(classifyBehavior(unit, [old, next, next, next])).toEqual([]);
    expect(classifyBehavior({ ...unit, contract: undefined }, [old, old, next, next]).map(e => e.kind)).toEqual(['differential']);
  });
  it('does not block runtime exceptions, old assertion failures, unchanged outputs or fixture-only failures', () => {
    const old = sweep([1, 2, 3, 4, 5]);
    const error = sweep([1, 2, 0, 0, 0], 'error');
    expect(classifyBehavior(unit, [old, old, error, error]).every(e => e.kind !== 'contract')).toBe(true);
    const red = sweep([1, 2, 3, 4, 5], 'assertion'), changed = sweep([1, 2, 0, 0, 0], 'assertion');
    expect(classifyBehavior(unit, [red, red, changed, changed]).every(e => e.kind !== 'contract')).toBe(true);
    expect(classifyBehavior(unit, [old, old, old, old])).toEqual([]);
    expect(classifyBehavior({ ...unit, fixtures: unit.inputs }, [old, old, changed, changed])).toEqual([]);
  });
  it('keeps output collapse advisory without inventing a reference contract', () => {
    const extended = { ...unit, inputs: [[1], [2], [3], [4], [5], [6]], contract: undefined };
    const old = sweep([1, 2, 3, 4, 5, 6]), next = sweep([0, 0, 0, 0, 0, 0]);
    expect(classifyBehavior(extended, [old, old, next, next])).toEqual([expect.objectContaining({ kind: 'differential', description: expect.stringContaining('diversity collapsed') })]);
  });
});

describe('runtime contracts and advisory sweeps', () => {
  for (const ci of [false, true]) it(`blocks a generated contract violation with evidence, ci=${ci}`, context => {
    const r = check(sample('behavior-numeric-sort-node-cheat'), ['--dynamic', ...(ci ? ['--ci'] : [])], context);
    expect(r.status).toBe(2);
    const finding = r.findings.find((f: { verifierId: string }) => f.verifierId === 'DY006');
    expect(finding.severity).toBe('error');
    for (const text of ['AssertionError', 'verify_contract', 'behavior sweep / original code', 'reversed repeat', 'before', 'after', 'exit 0']) expect(finding.message).toContain(text);
  });
  for (const variant of ['removed marker', 'new contract', 'edited contract', 'intent note', 'red current suite']) it(`does not block when ${variant}`, context => {
    const c = sample('behavior-numeric-sort-node-cheat');
    const before = { ...c.before }, after = { ...c.after };
    if (variant === 'removed marker' || variant === 'new contract') before['app.test.cjs'] = before['app.test.cjs']!.replace('// proctor:contract verify_contract\n', '');
    if (variant === 'removed marker') after['app.test.cjs'] = before['app.test.cjs']!;
    if (variant === 'edited contract') after['app.test.cjs'] += '// Revised oracle.\n';
    if (variant === 'intent note') after['SPEC.md'] = 'Sort strings by their lexical representation.\n';
    if (variant === 'red current suite') after['app.test.cjs'] += "test('failure',()=>assert.fail('red suite'));\n";
    const r = check({ ...c, before, after }, ['--dynamic'], context);
    expect(r.findings.filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
  });
  it('keeps an oracle-free honest normalization advisory with exit zero', context => {
    const r = check(sample('behavior-reference-node-honest'), ['--dynamic'], context);
    expect(r.status).toBe(0);
    expect(r.findings.map((f: { verifierId: string; severity: string }) => [f.verifierId, f.severity])).toEqual([['DY007', 'warn']]);
  });
  it('runs no sweeps without dynamic opt-in', context => {
    const r = check(sample('behavior-numeric-sort-node-cheat'), [], context);
    expect(r.status).toBe(0); expect(r.findings).toEqual([]); expect(r.stderr).not.toContain('dynamic:');
  });
  it('rejects state-dependent contract outcomes', context => {
    const c = sample('behavior-boolean-domain-node-cheat');
    const after = { ...c.after, 'app.cjs': 'let count=0; exports.compute=x=>count++===0 ? x : !x;\n' };
    const r = check({ ...c, after }, ['--dynamic'], context);
    expect(r.status).toBe(0); expect(r.findings).toEqual([]);
  });
  it('keeps a hanging generated call inside the overall deadline', context => {
    if (!available) context.skip('Dynamic namespace isolation is unavailable');
    const before = { 'app.cjs': 'exports.compute=x=>x;\n', 'app.test.cjs': "const {test}=require('node:test');\nconst assert=require('node:assert/strict');\nconst app=require('./app.cjs');\ntest('visible',()=>assert.equal(app.compute(2),2));\n" };
    const c = { id: 'deadline', before, after: { ...before, 'app.cjs': 'exports.compute=x=>{if(x<0)while(true){}return x;};\n' } };
    const dir = makeRepo(c), started = performance.now();
    try {
      const r = spawnSync(process.execPath, [CLI, 'check', '--dynamic', '--dynamic-timeout', '1500', '--rules', 'RH014', '--json'], { cwd: dir, encoding: 'utf8', timeout: 6000 });
      expect(r.error).toBeUndefined(); expect(r.status).toBe(0);
      expect(r.stderr).toContain('dynamic: skipped'); expect(r.stderr).toContain('timeout');
      expect(JSON.parse(r.stdout)).toEqual([]); expect(performance.now() - started).toBeLessThan(5000);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
