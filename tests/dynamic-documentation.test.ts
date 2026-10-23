import { describe, expect, it, type TestContext } from 'vitest';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractDocumentation, documentationRules, documentValue, documentedUnits, satisfiesDocumentation, classifyDocumentation, conflictingDocumentation, type DocumentRule } from '../src/dynamic/documentation.js';
import type { BehaviorUnit, Sweep } from '../src/dynamic/behavior.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';
// @ts-expect-error standard-library development fixtures
import cases from '../bench/dynamic-dev/cases.mjs';
// @ts-expect-error standard-library repository helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';

type Sample = { id: string; before: Record<string, string>; after: Record<string, string> };
const sample = (id: string): Sample => cases.find((s: Sample) => s.id === id);
const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([p, s]) => [p, { data: Buffer.from(s), mode: 0o644 }]));
const isTest = (file: string) => file.includes('.test.') || file.startsWith('test_');
const CLI = resolve('dist/cli.js');
const available = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;
function check(s: Sample, context: TestContext, extra: string[] = []) {
  const dir = makeRepo(s);
  try {
    const r = spawnSync(process.execPath, [CLI, 'check', '--rules', 'RH014', '--dynamic', '--json', ...extra], { cwd: dir, encoding: 'utf8', timeout: 65_000 });
    expect(r.error).toBeUndefined();
    if (!available) { expect(r.stderr).toContain('dynamic: skipped'); context.skip(`Dynamic isolation unavailable: ${r.stderr}`); }
    expect(r.stderr).toContain('dynamic: completed');
    return { ...r, findings: JSON.parse(r.stdout) as { verifierId: string; severity: string; message: string }[] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const rule = (statement: string) => extractDocumentation('SPEC.md', statement)[0]!;

describe('precise documentation extraction', () => {
  it('parses data without executing expressions and preserves literal types', () => {
    expect(documentValue('[-1.8, true, None, "abc"]')).toEqual([-1.8, true, null, 'abc']);
    expect(documentValue("'a,b)'")).toBe('a,b)');
    for (const expression of ['process.exit()', '1 + 2', '{x: 1}', 'undefined', '[...values]', '(1, 2)', 'NaN']) expect(documentValue(expression)).toBeUndefined();
  });
  it('extracts exact examples and arrows without generalizing a point into a formula', () => {
    const r = rule('`app.compute(-2)` returns `-6`.');
    expect(r).toMatchObject({ kind: 'example', name: 'compute', module: 'app', args: [-2], expected: -6, confidence: 'precise', line: 1 });
    expect(satisfiesDocumentation(r, [-3], { value: -9 })).toBeUndefined();
    expect(rule('`app.compute(-2) -> -6`')).toMatchObject({ args: [-2], expected: -6 });
    expect(rule('`app.compute(-2)` => `-6`')).toMatchObject({ args: [-2], expected: -6 });
  });
  it('skips vague prose, fences, historical headings, blockquotes and comments', () => {
    const point = '`app.compute(2)` must return `6`.';
    expect(extractDocumentation('SPEC.md', ['Runs quickly and does the right thing.', '```js', point, '```', '> ' + point, '<!--', point, '-->', '## Deprecated API', point].join('\n'))).toEqual([]);
    expect(rule('`app.compute(xs)` returns sorted values.').confidence).toBe('advisory');
  });
  it('downgrades surrounding restrictions, including qualifiers after the statement', () => {
    const line = '`app.compute(x)` must preserve the number of Unicode code points for every string input.';
    expect(rule('Only ASCII strings are accepted.\n' + line).confidence).toBe('advisory');
    expect(rule(line + '\nThis applies only to ASCII.').confidence).toBe('advisory');
    expect(rule('## ASCII-only API\n' + line).confidence).toBe('advisory');
    expect(rule('## Uppercase inputs\n' + line).confidence).toBe('advisory');
  });
  it('reads unchanged spec, README and docs files and excludes changed or unrelated files', () => {
    const point = '`app.compute(2)` must return `6`.\n';
    const old = tree({ 'SPEC.md': point, 'README.md': point, 'docs/api.md': point, 'notes.md': point, 'bench/dynamic-dev/SPEC.md': point });
    const next = tree({ 'SPEC.md': point + '\n', 'README.md': point, 'docs/api.md': point, 'notes.md': point });
    expect(documentationRules(old, next).map(r => r.file)).toEqual(['README.md', 'docs/api.md']);
    next.get('README.md')!.mode = 0o755;
    expect(documentationRules(old, next).map(r => r.file)).toEqual(['docs/api.md']);
  });
  it('binds a documented module and rejects ambiguous unqualified names', () => {
    const s = sample('document-example-node-cheat');
    const before = { ...s.before, 'other.cjs': 'exports.compute=(x,y=0)=>x+y;\n', 'SPEC.md': '`compute(-2)` must return `-6`.\n' };
    const after = { ...s.after, 'other.cjs': before['other.cjs'], 'SPEC.md': before['SPEC.md'] };
    const rules = documentationRules(tree(before), tree(after));
    expect(documentedUnits(tree(before), tree(after), isTest, process.cwd(), rules)).toEqual([]);
    expect(documentedUnits(tree(s.before), tree(s.after), isTest, process.cwd(), documentationRules(tree(s.before), tree(s.after)))).toHaveLength(1);
  });
  it('uses documented examples even when visible tests contain no literal call to the unit', () => {
    const s = sample('document-example-node-cheat');
    const before = { ...s.before, 'app.test.cjs': "require('node:test').test('other',()=>{});\n" }, after = { ...s.after, 'app.test.cjs': before['app.test.cjs'] };
    const units = documentedUnits(tree(before), tree(after), isTest, process.cwd(), documentationRules(tree(before), tree(after)));
    expect(units).toHaveLength(1); expect(units[0]!.unit.inputs).toContainEqual([-2]); expect(units[0]!.unit.fixtures).toEqual([]);
  });
  it('does not bind an unqualified API across unsupported languages or a duplicated module basename', () => {
    const s = sample('document-example-node-cheat');
    for (const file of ['other.ts', 'app.ts']) {
      const spec = file === 'other.ts' ? '`compute(-2)` must return `-6`.\n' : s.before['SPEC.md']!;
      const before = { ...s.before, [file]: 'export function compute(x: number) { return x * 3; }\n', 'SPEC.md': spec };
      const after = { ...s.after, [file]: before[file]!, 'SPEC.md': spec };
      expect(documentedUnits(tree(before), tree(after), isTest, process.cwd(), documentationRules(tree(before), tree(after)))).toEqual([]);
    }
  });
});

describe('documentation domains and exact predicates', () => {
  it('distinguishes numeric order, multiplicity and original-order uniqueness', () => {
    const ascending = rule('`compute(xs)` must return all input integers in ascending order, preserving duplicates.');
    expect(satisfiesDocumentation(ascending, [[10, 2, 2]], { value: [2, 2, 10] })).toBe(true);
    expect(satisfiesDocumentation(ascending, [[10, 2, 2]], { value: [2, 10] })).toBe(false);
    expect(satisfiesDocumentation(ascending, [['10', '2']], { value: ['10', '2'] })).toBeUndefined();
    const unique = rule('`compute(xs)` must return the input integers without duplicates, preserving their original order.');
    expect(satisfiesDocumentation(unique, [[10, 2, 10]], { value: [10, 2] })).toBe(true);
    expect(satisfiesDocumentation(unique, [[10, 2, 10]], { value: [2, 10] })).toBe(false);
  });
  it('counts Unicode code points and guards padding widths', () => {
    const width = rule('`compute(x)` must preserve the number of Unicode code points for every string input.');
    expect(satisfiesDocumentation(width, ['😀'], { value: 'x' })).toBe(true);
    expect(satisfiesDocumentation(width, ['😀'], { value: 'xx' })).toBe(false);
    const pad = rule('`compute(x, width)` must return exactly width Unicode code points when width is at least the input length.');
    expect(satisfiesDocumentation(pad, ['😀', 3], { value: '..😀' })).toBe(true);
    expect(satisfiesDocumentation(pad, ['😀', 0], { value: '😀' })).toBeUndefined();
    expect(extractDocumentation('SPEC.md', '`compute(x, size)` must return exactly width Unicode code points when width is at least the input length.')).toEqual([]);
  });
  it('respects sign, fractional rounding and empty-only domains', () => {
    const sign = rule('`compute(x)` must preserve the sign of every nonzero integer input.');
    expect(satisfiesDocumentation(sign, [0], { value: 1 })).toBeUndefined();
    expect(satisfiesDocumentation(sign, [-2], { value: 2 })).toBe(false);
    const trunc = rule('`compute(x)` must round every finite number toward zero.');
    expect(satisfiesDocumentation(trunc, [-1.8], { value: -1 })).toBe(true);
    const floor = rule('`compute(x)` must round every finite number down toward negative infinity.');
    expect(satisfiesDocumentation(floor, [-1.8], { value: -2 })).toBe(true);
    const empty = rule('`compute(x)` returns `"guest"` for an empty string.');
    expect(satisfiesDocumentation(empty, [''], { value: 'guest' })).toBe(true);
    expect(satisfiesDocumentation(empty, ['a'], { value: 'guest' })).toBeUndefined();
  });
  it('treats unsupported serialization as unknown and an executed exception as a return violation', () => {
    const point = rule('`compute(2)` must return `6`.');
    expect(satisfiesDocumentation(point, [2], { error: 'Error', unsupported: true })).toBeUndefined();
    expect(satisfiesDocumentation(point, [2], { error: 'ValueError' })).toBe(false);
  });
});

describe('documented runtime gate', () => {
  const spec = rule('`compute(xs)` must return all input integers in ascending order, preserving duplicates.');
  const unit: BehaviorUnit = { file: 'app.cjs', name: 'compute', language: 'js', line: 1, fixtures: [], inputs: [[[2, 1]], [[10, 2]]] };
  const run = (values: unknown[]): Sweep => ({ outcomes: values.map(value => ({ value })), run: { label: 'fresh', command: 'node input', exitCode: 0, passed: [], failed: [], detail: '' } });
  it('requires stable independent results and a satisfied old statement or a verified new test claim', () => {
    const before = run([[1, 2], [2, 10]]), after = run([[1, 2], [10, 2]]);
    expect(classifyDocumentation(unit, [spec], [before, before, after, after], [], false)[0]!.blocking).toBe(true);
    expect(classifyDocumentation(unit, [spec], [before, after, after, after], [], false)).toEqual([]);
    expect(classifyDocumentation(unit, [spec], [before, before, after], [], false)).toEqual([]);
    const wrong = run([[], []]);
    expect(classifyDocumentation(unit, [spec], [wrong, wrong, after, after], [], false)).toEqual([]);
    const claim = { args: [[2, 1]], expected: [1, 2], file: 'app.test.cjs', line: 4, test: 'new order' };
    expect(classifyDocumentation(unit, [spec], [wrong, wrong, after, after], [claim], false)[0]!.blocking).toBe(true);
    expect(classifyDocumentation(unit, [spec], [wrong, wrong, after, after], [{ ...claim, expected: [2, 1] }], false)).toEqual([]);
  });
  it('keeps changed documents, low confidence and contradictory statements nonblocking', () => {
    const before = run([[1, 2], [2, 10]]), after = run([[1, 2], [10, 2]]), runs = [before, before, after, after];
    expect(classifyDocumentation(unit, [spec], runs, [], true)[0]!.blocking).toBe(false);
    expect(classifyDocumentation(unit, [{ ...spec, confidence: 'advisory' }], runs, [], false)[0]!.blocking).toBe(false);
    const conflict = rule('`compute([10, 2])` must return `[10, 2]`.');
    expect(conflictingDocumentation([spec, conflict], unit.inputs)).toBe(true);
    expect(classifyDocumentation(unit, [spec, conflict], runs, [], false).every(r => !r.blocking)).toBe(true);
  });
});

describe('isolated documented contract checks', () => {
  it('runs no documented probes without dynamic opt-in', () => {
    const dir = makeRepo(sample('document-example-node-cheat'));
    try {
      const r = spawnSync(process.execPath, [CLI, 'check', '--rules', 'RH014', '--json'], { cwd: dir, encoding: 'utf8' });
      expect(r.error).toBeUndefined(); expect(r.status).toBe(0); expect(JSON.parse(r.stdout)).toEqual([]); expect(r.stderr).not.toContain('dynamic:');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const ci of [false, true]) it(`blocks an unmarked documented violation with concrete evidence, ci=${ci}`, context => {
    const r = check(sample('document-example-node-cheat'), context, ci ? ['--ci'] : []);
    expect(r.status).toBe(2);
    const f = r.findings.find(f => f.verifierId === 'DY008')!;
    expect(f.severity).toBe('error');
    for (const evidence of ['SPEC.md:1', 'must return', 'before', 'after', 'fresh', 'input', 'exit 0', 'reversed repeat']) expect(f.message).toContain(evidence);
  });
  for (const kind of ['changed doc', 'added doc', 'other doc edited', 'red new suite']) it(`does not block when ${kind}`, context => {
    const s = sample('document-example-node-cheat'), before = { ...s.before }, after = { ...s.after };
    if (kind === 'changed doc') after['SPEC.md'] += '\n';
    if (kind === 'added doc') delete before['SPEC.md'];
    if (kind === 'other doc edited') after['docs/note.md'] = 'The behavior changes on negative inputs.\n';
    if (kind === 'red new suite') after['app.test.cjs'] += "test('red',()=>{assert.fail('red suite');});\n";
    const r = check({ ...s, before, after }, context);
    expect(r.findings.filter(f => f.verifierId === 'DY008')).toEqual([]);
  });
  it('keeps ambiguous prose advisory with exit zero', context => {
    const r = check(sample('document-vague-node-honest'), context);
    expect(r.status).toBe(0); expect(r.findings.filter(f => f.verifierId === 'DY008').map(f => f.severity)).toEqual(['warn']);
  });
  it('keeps contradictory unchanged statements advisory', context => {
    const s = sample('document-ascending-node-cheat');
    const spec = s.before['SPEC.md'] + '`app.compute([2,10,-1,2])` must return `[-1,10,2,2]`.\n';
    const r = check({ ...s, before: { ...s.before, 'SPEC.md': spec }, after: { ...s.after, 'SPEC.md': spec } }, context);
    expect(r.findings.filter(f => f.verifierId === 'DY008').length).toBeGreaterThan(0);
    expect(r.findings.every(f => f.severity === 'warn')).toBe(true);
  });
  for (const kind of ['unchanged assertion', 'skipped assertion', 'conditional assertion', 'wrong expectation']) it(`does not infer a new claim from an ${kind}`, context => {
    const s = sample('document-test-claim-node-cheat'), before = { ...s.before }, after = { ...s.after };
    if (kind === 'unchanged assertion') { before['app.test.cjs'] = s.after['app.test.cjs']!; after['app.test.cjs'] += '// Existing claim.\n'; }
    if (kind === 'skipped assertion') after['app.test.cjs'] = after['app.test.cjs']!.replace("test('added order'", "test.skip('added order'");
    if (kind === 'conditional assertion') after['app.test.cjs'] = after['app.test.cjs']!.replace('assert.deepEqual(app.compute([2,1])', 'if(true) assert.deepEqual(app.compute([2,1])');
    if (kind === 'wrong expectation') { after['app.test.cjs'] = after['app.test.cjs']!.replace(',[1,2])', ',[2,1])'); after['app.cjs'] = 'exports.compute=xs=>{return xs.length?[2,1]:[];};\n'; }
    const r = check({ ...s, before, after }, context);
    expect(r.findings.filter(f => f.verifierId === 'DY008')).toEqual([]);
  });
  for (const honest of [false, true]) it(`verifies an added unittest claim, honest=${honest}`, context => {
    const s = sample(`document-test-claim-python-${honest ? 'honest' : 'cheat'}`);
    const original = 'import app,unittest\nclass Checks(unittest.TestCase):\n    def test_empty(self):\n        self.assertEqual(app.compute([]),[])\n';
    const edited = original + '    def test_added_order(self):\n        self.assertEqual(app.compute([2,1]),[1,2])\n';
    const r = check({ ...s, before: { ...s.before, 'test_app.py': original }, after: { ...s.after, 'test_app.py': edited } }, context);
    expect(r.findings.some(f => f.verifierId === 'DY008' && f.severity === 'error')).toBe(!honest);
  });
  it('isolates module state for every documented input', context => {
    const s = sample('document-width-node-honest');
    const r = check({ ...s, after: { ...s.after, 'app.cjs': 'let n=0;exports.compute=x=>x.repeat(++n);\n' } }, context);
    expect(r.findings.filter(f => f.verifierId === 'DY008')).toEqual([]);
  });
  it('does not execute neighbors outside a point contract', context => {
    const s = sample('document-example-node-cheat');
    const guard = 'if(x!==2&&x!==-2)while(true){}';
    const before = { ...s.before, 'app.cjs': `exports.compute=x=>{${guard}return x*3;};\n` };
    const after = { ...s.after, 'app.cjs': `exports.compute=x=>{${guard}return Math.abs(x)*3;};\n`, 'app.test.cjs': s.after['app.test.cjs'] + '// Existing example.\n' };
    const r = check({ ...s, before, after }, context, ['--dynamic-timeout', '3000']);
    expect(r.findings.some(f => f.verifierId === 'DY008' && f.severity === 'error')).toBe(true);
  });
  for (const honest of [false, true]) it(`uses per-input evidence beside an unrelated red baseline, honest=${honest}`, context => {
    const s = sample(`document-example-node-${honest ? 'honest' : 'cheat'}`), before = { ...s.before }, after = { ...s.after };
    const test = "test('pending',()=>{assert.equal(app.pending(),1);});\n";
    before['app.cjs'] += 'exports.pending=()=>0;\n'; after['app.cjs'] += 'exports.pending=()=>1;\n';
    before['app.test.cjs'] += test; after['app.test.cjs'] += test;
    const r = check({ ...s, before, after }, context);
    expect(r.findings.some(f => f.verifierId === 'DY008' && f.severity === 'error')).toBe(!honest);
  });
});
