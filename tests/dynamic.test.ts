import { describe, expect, it, type TestContext } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseResults, detectAdapter } from '../src/dynamic/adapters.js';
import { expectedEdits, expectationOnlyEdit, findProbes } from '../src/dynamic/signals.js';
import { changedSourceLines, jsMutations, MUTATION_LIMIT, pythonMutations } from '../src/dynamic/mutations.js';
import { runDynamic } from '../src/dynamic/runner.js';
import { runGitDiff } from '../src/diff.js';
import { buildContext } from '../src/context/index.js';
import { sarifReport } from '../src/reporters/sarif.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';
// The dev corpus uses only Node and Python standard libraries.
// @ts-expect-error plain ECMAScript corpus is also runnable without a compiler
import samples from '../bench/dynamic-dev/cases.mjs';
// @ts-expect-error standard-library fixture helper
import { makeRepo, writeTree } from '../bench/dynamic-dev/run.mjs';

type Sample = { id: string; family: string; label: string; before: Record<string, string>; after: Record<string, string>; expected: string[] };
const cases = samples as Sample[];
const CLI = resolve('dist/cli.js');
const workerPath = resolve('dist/dynamic-worker.js');
const sandboxAvailable = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;
function runnable(result: Awaited<ReturnType<typeof runDynamic>>, context: TestContext): void {
  if (!sandboxAvailable) {
    expect(result.status).toBe('skipped'); expect(result.reason).toBeTruthy(); expect(result.findings).toEqual([]);
    context.skip(`Dynamic isolation is unavailable: ${result.reason}`);
  }
  expect(result.status, result.reason).toBe('completed');
}

function dynamic(dir: string, extra = {}) {
  const { files } = runGitDiff(['HEAD'], dir, { includeUntracked: true });
  return runDynamic({ cwd: dir, workerPath, files, testPathGlobs: ['**/*.test.{js,mjs,cjs}', '**/test_*.py'], ...extra });
}
const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([p, s]) => [p, { data: Buffer.from(s), mode: 0o644 }]));

describe('dynamic result parsing and conservative signals', () => {
  it('keeps named TAP results and drops skipped, TODO and ambiguous names', () => {
    expect(parseResults('tap', 'ok 1 - good\nnot ok 2 - bad\nok 3 - omitted # SKIP no service\nnot ok 4 - planned # TODO soon\nok 5 - duplicate\nok 6 - duplicate\n', '')).toEqual({ passed: ['good'], failed: ['bad'] });
  });
  it.each(['jest', 'vitest'] as const)('parses %s JSON with script preamble', kind => {
    const data = { testResults: [{ assertionResults: [{ fullName: 'suite works', status: 'passed' }, { fullName: 'suite fails', status: 'failed' }, { fullName: 'skip', status: 'pending' }] }] };
    expect(parseResults(kind, `npm banner\n${JSON.stringify(data)}`, 'failing test source: { throw Error() }')).toEqual({ passed: ['suite works'], failed: ['suite fails'] });
  });
  it('parses pytest JUnit and excludes skips', () => {
    const xml = '<testsuite><testcase classname="tests.test_app" name="test_ok"/><testcase classname="tests.test_app" name="test_bad"><failure message="no"/></testcase><testcase name="test_skip"><skipped/></testcase></testsuite>';
    expect(parseResults('pytest', '', '', xml)).toEqual({ passed: ['tests.test_app::test_ok'], failed: ['tests.test_app::test_bad'] });
  });
  it('parses unittest named outcomes', () => {
    expect(parseResults('unittest', '', 'test_ok (test_app.Checks.test_ok) ... ok\ntest_bad (test_app.Checks.test_bad) ... FAIL\n')).toEqual({ passed: ['test_ok (test_app.Checks.test_ok)'], failed: ['test_bad (test_app.Checks.test_bad)'] });
  });
  it('selects scripts and Python frameworks without guessing arbitrary commands', () => {
    for (const framework of ['vitest', 'jest', 'node --test']) {
      expect(detectAdapter(tree({ 'package.json': JSON.stringify({ scripts: { test: framework } }) }), []).command).toBe('npm');
    }
    expect(detectAdapter(tree({ 'test_app.py': 'import pytest\n' }), ['test_app.py']).kind).toBe('pytest');
    expect(() => detectAdapter(tree({ 'app.go': '' }), [])).toThrow('not run');
    expect(() => detectAdapter(tree({ 'package.json': '{"scripts":{"test":"cargo test"}}' }), [])).toThrow('unrecognized');
  });
  it('recognizes exact expected literal edits and ignores actual expression changes', () => {
    expect(expectedEdits('assert.equal(f(2), 4);', 'assert.equal(f(2), 5);')).toBe(true);
    expect(expectedEdits('assert.equal(f(2), 4);', 'assert.equal(f(3), 5);')).toBe(false);
    expect(expectedEdits('const expected = 4;', 'const expected = 5;')).toBe(false);
    expect(expectationOnlyEdit('assert.equal(f(2), 4);', 'assert.equal(f(2), 5);')).toBe(true);
    expect(expectationOnlyEdit('assert.equal(f(2), 4);', 'mock();\nassert.equal(f(2), 5);')).toBe(false);
  });
  it('limits probes to simple named arithmetic functions, excluding existing branches', () => {
    const old = tree({ 'app.mjs': 'export function f(x) { return x * 2; }\n' });
    const next = tree({ 'app.mjs': 'export function f(x) {\nif (x === 9) return 0;\nreturn x * 2;\n}\n' });
    expect(findProbes(old, next, () => false)).toHaveLength(1);
    expect(findProbes(next, next, () => false)).toEqual([]);
    expect(findProbes(old, next, () => true)).toEqual([]);
    expect(findProbes(tree({ 'app.mjs': 'export function f(x) { return external(x); }' }), next, () => false)).toEqual([]);
  });
  it('includes metadata in SARIF only when a dynamic finding exists', () => {
    const plain = JSON.parse(sarifReport([]));
    const report = JSON.parse(sarifReport([{ verifierId: 'DY001', severity: 'warn', file: 'x.js', line: 1, message: 'Evidence: baseline passed, cross-run failed', suggestion: 'Review' }]));
    expect(report.runs[0].tool.driver.rules.length).toBe(plain.runs[0].tool.driver.rules.length + 1);
    expect(report.runs[0].tool.driver.rules.some((r: { id: string }) => r.id === 'DY001')).toBe(true);
  });
});

describe('dynamic probe and mutation extensions', () => {
  it.each([
    ['x.toLowerCase()', "'ABC'", "'patched'"], ['x.trim()', "''", "'empty'"],
    ["'hello ' + x", "'Ada'", "'changed'"], ['!x', 'true', 'true'], ['x', 'false', 'true'],
  ])('recognizes simple typed references: %s', (expression, input, output) => {
    const before = tree({ 'app.mjs': `export function convert(x) { return ${expression}; }\n` });
    const after = tree({ 'app.mjs': `export function convert(x) {\n  if (x === ${input}) return ${output};\n  return ${expression};\n}\n` });
    expect(findProbes(before, after, () => false)).toHaveLength(1);
    expect(findProbes(before, tree({ 'app.mjs': after.get('app.mjs')!.data.toString().replace('if (x ===', 'if (other ===') }), () => false)).toEqual([]);
    expect(findProbes(before, tree({ 'app.mjs': after.get('app.mjs')!.data.toString().replace(`return ${expression};`, `return external(x);`) }), () => false)).toEqual([]);
  });
  it('finds changed lines without treating a repeated unchanged statement as an edit', () => {
    expect([...changedSourceLines('a\nb\na\nc\n', 'a\nnew\nb\na\nc\n')]).toEqual([2]);
    expect([...changedSourceLines('a\nb\nc\n', 'a\nc\n')]).toEqual([]);
  });
  it('requires an observed containing function and caps parser-confirmed JS mutations', () => {
    const before = `function f(x) {\n${'  x += 0;\n'.repeat(6)}  return x;\n}\n`;
    const source = before.replaceAll('+= 0', '+= 1');
    expect(jsMutations(before, source, [])).toEqual([]);
    const mutations = jsMutations(before, source, [{ start: 0, end: source.length - 1 }]);
    expect(mutations).toHaveLength(MUTATION_LIMIT);
    expect(mutations.every(m => m.operation === 'delete statement' && m.functionName === 'f')).toBe(true);
  });
  it('rejects a deletion that would move the following return into an unbraced condition', () => {
    const before = 'function f(x) {\n  if (x)\n    return x + 0;\n  return 0;\n}\n';
    const source = before.replace('+ 0', '+ 1');
    expect(jsMutations(before, source, [{ start: 0, end: source.length - 1 }])).toEqual([]);
  });
  it('negates a changed multiline JS guard without editing its body', () => {
    const before = 'function f(x) {\n  if (x < 0) {\n    return 99;\n  }\n  return x;\n}\n';
    const source = before.replace('x < 0', 'x <= 0');
    const mutations = jsMutations(before, source, [{ start: 0, end: source.length - 1 }]);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.operation).toBe('negate condition');
    expect(mutations[0]!.source).toContain('if (!(x <= 0)) {\n    return 99;');
  });
  it('does not mutate JS statements changed only by formatting or comments', () => {
    const before = 'function f(x) {\n  if (x < 0) return 99;\n  return x;\n}\n';
    const source = before.replace('if (x < 0)', 'if (x  <  0)').replace('return x;', 'return x; // clarified');
    expect(jsMutations(before, source, [{ start: 0, end: source.length - 1 }])).toEqual([]);
  });
  it('keeps Python candidate edits independent and skips uncalled functions', context => {
    if (spawnSync('python3', ['--version']).status !== 0) context.skip('Python 3 is unavailable for parser verification');
    const before = 'def f(x):\n    if x < 0:\n        return 0\n    return x * 2\n';
    const source = before.replace('return 0', 'return 99').replace('x * 2', 'x * 3');
    expect(pythonMutations(before, source, [], tmpdir())).toEqual([]);
    const mutations = pythonMutations(before, source, [1], tmpdir());
    expect(mutations.map(m => m.line)).toEqual([3, 4]);
    expect(mutations[0]!.source).toContain('return x * 3');
    expect(mutations[1]!.source).toContain('return 99');
    expect(pythonMutations(before, before.replace('return 0', 'return 0 # clarified'), [1], tmpdir())).toEqual([]);
  });
  it('runs each bare Python function in a fresh process, including async functions', async context => {
    const before = { 'tests/helper.py': 'value = 7\n', 'tests/test_functions.py': `import helper\nstate=[]\ndef test_first():\n    state.append(1)\n    assert helper.value == 7\ndef test_second():\n    assert state == []\nasync def test_async():\n    assert helper.value == 7\n` };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      for (const run of r.runs) {
        expect(run.passed).toEqual(['tests/test_functions.py::test_first', 'tests/test_functions.py::test_second', 'tests/test_functions.py::test_async']);
        expect(run.failed).toEqual([]);
        expect(run.fileRuns?.every(f => f.exitCode === 0 && f.command.includes('.proctor-python-test.py'))).toBe(true);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not silently accept duplicate bare Python function names', async context => {
    const before = { 'test_functions.py': 'def test_duplicate():\n    assert False\ndef test_duplicate():\n    assert True\n' };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir);
      expect(r.status).toBe('skipped'); expect(r.findings).toEqual([]);
      if (sandboxAvailable) expect(r.reason).toContain('duplicate Python function names');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('distinguishes the same bare function name in different Python files', async context => {
    const before = { 'app.py': 'def scale(x):\n    return x * 3\ndef pending():\n    return 0\n',
      'test_negative.py': 'import app\ndef test_value():\n    assert app.scale(-2) == -6\n',
      'test_pending.py': 'import app\ndef test_value():\n    assert app.pending() == 1\n' };
    const after = { ...before, 'app.py': 'def scale(x):\n    return abs(x * 3)\ndef pending():\n    return 1\n' };
    const dir = makeRepo({ before, after });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.runs[0]!.passed).toEqual(['test_negative.py::test_value']);
      expect(r.runs[1]!.failed).toEqual(['test_negative.py::test_value']);
      expect(r.findings.map(f => [f.verifierId, f.file])).toEqual([['DY001', 'test_negative.py']]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not turn an all-skipped unittest suite into a passing direct file', async context => {
    const before = { 'test_app.py': "import unittest\nclass Checks(unittest.TestCase):\n    @unittest.skip('service unavailable')\n    def test_service(self):\n        self.fail('must not execute')\n" };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir);
      expect(r.status).toBe('skipped'); expect(r.findings).toEqual([]);
      if (sandboxAvailable) expect(r.reason).toContain('no named test results');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(['node', 'python'])('observes and kills a covered change while detecting an unprotected %s statement', async (language, context) => {
    const sample = cases.find(c => c.id === `mutation-called-${language}-cheat`)!;
    const dir = makeRepo(sample);
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.runs[0]!.failed.length).toBeGreaterThan(0);
      expect(r.runs[1]!.exitCode).toBe(0);
      expect(r.findings.some(f => f.verifierId === 'DY004' && f.severity === 'warn' && f.message.includes('called function scale'))).toBe(true);
      const mutants = r.runs.filter(run => /^mutation \d+: (?:delete|negate)/.test(run.label));
      expect(mutants.length).toBeLessThanOrEqual(MUTATION_LIMIT);
      expect(mutants.some(run => run.failed.length > 0)).toBe(true);
      expect(mutants.some(run => run.exitCode === 0)).toBe(true);
      expect(readFileSync(join(dir, language === 'node' ? 'app.cjs' : 'app.py'), 'utf8')).toBe(sample.after[language === 'node' ? 'app.cjs' : 'app.py']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(['documented', 'edited tests', 'green baseline', 'uncalled', 'covered branches', 'formatting'])('does not warn on ambiguous mutation evidence: %s', async (variant, context) => {
    const sample = cases.find(c => c.id === 'mutation-called-node-cheat')!;
    const before = { ...sample.before }, after = { ...sample.after };
    if (variant === 'documented') after['SPEC.md'] = 'Negative values now use the calibration value.\n';
    if (variant === 'edited tests') after['app.test.cjs'] += '\n';
    if (variant === 'green baseline') before['app.cjs'] = before['app.cjs']!.replace('factor = 2', 'factor = 3');
    if (variant === 'covered branches') before['app.test.cjs'] = after['app.test.cjs'] += "test('covered negative',()=>assert.equal(app.scale(-2),99));\n";
    if (variant === 'formatting') {
      before['app.cjs'] = before['app.cjs']!.replace('  return x * factor;', '  if (x < 0) return 99;\n  return x * factor;');
      after['app.cjs'] = before['app.cjs']!.replace('factor = 2', 'factor = 3').replace('if (x < 0)', 'if (x  <  0)');
    }
    if (variant === 'uncalled') {
      before['app.cjs'] += 'exports.pending = () => 0;\n'; after['app.cjs'] += 'exports.pending = () => 1;\n';
      before['app.test.cjs'] = after['app.test.cjs'] = "const {test}=require('node:test');const assert=require('node:assert/strict');const app=require('./app.cjs');test('fix pending',()=>assert.equal(app.pending(),1));\n";
    }
    const dir = makeRepo({ before, after });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(['--json', '--sarif'])('keeps probe and mutation warnings advisory with %s output', (format, context) => {
    for (const id of ['red-numeric-node-cheat', 'mutation-called-node-cheat']) {
      const dir = makeRepo(cases.find(c => c.id === id)!);
      try {
        const r = spawnSync(process.execPath, [CLI, 'check', '--dynamic', '--rules', 'RH014', format], { cwd: dir, encoding: 'utf8' });
        if (!sandboxAvailable) context.skip(`Dynamic isolation is unavailable: ${r.stderr}`);
        expect(r.status).toBe(0);
        const json = JSON.parse(r.stdout);
        if (format === '--json') {
          expect(json.length).toBeGreaterThan(0);
          expect(json.every((f: { severity: string }) => f.severity === 'warn')).toBe(true);
        } else {
          expect(json.runs[0].results.length).toBeGreaterThan(0);
          expect(json.runs[0].results.every((f: { level: string }) => f.level === 'warning')).toBe(true);
        }
        expect(r.stderr).toContain('dynamic: completed');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
});

describe('isolated dynamic execution and precision twins', () => {
  for (const sample of cases) it(sample.id, async context => {
    const dir = makeRepo(sample);
    try {
      const result = await dynamic(dir);
      runnable(result, context);
      if (sample.id.startsWith('red-') || sample.id.startsWith('plain-red-') || ['typed-probe', 'bare-python', 'mutation-lite'].includes(sample.family)) {
        expect(result.runs[0]!.failed.length).toBeGreaterThan(0);
        if (sample.label === 'honest') expect(result.runs[1]!.exitCode).toBe(0);
      }
      const ids = result.findings.map(f => f.verifierId);
      if (sample.label === 'honest' || sample.expected.length === 0) expect(ids).toEqual([]);
      for (const id of sample.expected) expect(ids).toContain(id);
      for (const f of result.findings) {
        expect(f.message).toContain('Evidence:'); expect(f.message).toContain('exit ');
      }
      for (const [path, text] of Object.entries(sample.after)) expect(readFileSync(join(dir, path), 'utf8')).toBe(text);
      expect(spawnSync('git', ['diff', '--cached', '--exit-code'], { cwd: dir }).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps default output identical and does not execute tests without opt-in', () => {
    const sample = cases[0]!;
    const dir = makeRepo(sample);
    try {
      writeFileSync(join(dir, 'app.test.cjs'), "require('node:fs').writeFileSync('executed', 'yes');\n");
      const result = spawnSync(process.execPath, [CLI, 'check', '--json', '--rules', 'RH014'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toEqual([]);
      expect(result.stderr).not.toContain('dynamic:'); expect(existsSync(join(dir, 'executed'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('reads dynamic opt-in and budget from the committed config', async context => {
    const dir = makeRepo(cases[0]!);
    try {
      writeFileSync(join(dir, 'proctor.config.json'), '{"dynamic":true,"dynamicTimeoutMs":1234}');
      const uncommitted = await buildContext(dir, [], { configRef: 'HEAD' });
      expect(uncommitted.dynamic).toBeUndefined();
      spawnSync('git', ['add', 'proctor.config.json'], { cwd: dir }); spawnSync('git', ['commit', '-qm', 'Configure dynamic checks'], { cwd: dir });
      const config = await buildContext(dir, [], { configRef: 'HEAD' });
      expect(config.dynamic).toBe(true); expect(config.dynamicTimeoutMs).toBe(1234);
      const result = spawnSync(process.execPath, [CLI, 'check', '--json', '--rules', 'RH014'], { cwd: dir, encoding: 'utf8' });
      expect(result.stderr).toContain('dynamic:');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses the index for --staged and the merge base for --base', async context => {
    const dir = makeRepo(cases[0]!);
    try {
      spawnSync('git', ['add', '.'], { cwd: dir });
      writeTree(dir, cases[0]!.before, cases[0]!.after);
      const staged = await dynamic(dir, { staged: true });
      runnable(staged, context); expect(staged.findings.some(f => f.verifierId === 'DY001')).toBe(true);
      spawnSync('git', ['commit', '-qm', 'Change behavior'], { cwd: dir });
      const committed = await dynamic(dir, { base: 'HEAD^' });
      runnable(committed, context); expect(committed.findings.some(f => f.verifierId === 'DY001')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('runs the original test file even when the entire file is deleted', async context => {
    const sample = cases[0]!;
    const before = { ...sample.before, 'negative.test.cjs': "const {test}=require('node:test'); const assert=require('node:assert/strict'); const app=require('./app.cjs'); test('separate negative',()=>assert.equal(app.scale(-2),-6));\n" };
    const dir = makeRepo({ before, after: sample.after });
    try {
      const result = await dynamic(dir);
      runnable(result, context); expect(result.findings.some(f => f.file === 'negative.test.cjs')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('fails open on missing runners, unsupported language and dependency drift', async context => {
    const variants = [
      { 'app.go': 'package main\n' },
    ];
    for (const before of variants) {
      const dir = makeRepo({ before, after: before });
      try { const r = await dynamic(dir); expect(r.status).toBe('skipped'); expect(r.findings).toEqual([]); }
      finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const dir = makeRepo(cases[0]!);
    try {
      writeFileSync(join(dir, 'package.json'), '{"scripts":{"test":"vitest run"}}');
      const r = await dynamic(dir); expect(r.status).toBe('skipped'); if (sandboxAvailable) expect(r.reason).toContain('manifest changed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('bounds the whole worker and cleans scratch directories', async context => {
    const dir = makeRepo(cases[0]!);
    const before = new Set(readdirSync(tmpdir()).filter(n => n.startsWith('proctor-dynamic-')));
    try {
      const start = performance.now(); const r = await dynamic(dir, { timeoutMs: 1 });
      expect(r.status).toBe('skipped'); if (sandboxAvailable) expect(r.reason).toContain('timeout'); expect(r.findings).toEqual([]);
      expect(performance.now() - start).toBeLessThan(2000);
      expect(readdirSync(tmpdir()).filter(n => n.startsWith('proctor-dynamic-') && !before.has(n))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('denies writes to the original tree and denies access to host network', async context => {
    const before = { 'isolation.test.cjs': `const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');\ntest('write confined',()=>assert.throws(()=>fs.writeFileSync(${JSON.stringify(join(tmpdir(), 'proctor-dynamic-outside-marker'))},'bad')));\ntest('network confined',async()=>{await assert.rejects(fetch('http://192.0.2.1:9',{signal:AbortSignal.timeout(500)}));});\n` };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir); runnable(r, context); expect(r.runs[0]!.passed).toHaveLength(2);
      expect(existsSync(join(tmpdir(), 'proctor-dynamic-outside-marker'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('dynamic runner scripts and lifecycle', () => {
  it('uses the project node:test script', async context => {
    const sample = cases[0]!;
    const packageJson = JSON.stringify({ scripts: { test: 'node --test' } });
    const dir = makeRepo({ before: { ...sample.before, 'package.json': packageJson }, after: { ...sample.after, 'package.json': packageJson } });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.runs.every(run => run.command === 'NODE_OPTIONS=--test-reporter=tap npm run test')).toBe(true);
      expect(r.findings.some(f => f.verifierId === 'DY001')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('ends detached descendants on normal completion and timeout', async context => {
    for (const hang of [false, true]) {
      const token = `proctor-dynamic-child-${Date.now()}-${hang}`;
      const body = `const {test}=require('node:test');const {spawn}=require('node:child_process');\ntest('child lifecycle',async()=>{const c=spawn(process.execPath,['-e',${JSON.stringify(`process.title=${JSON.stringify(token)};setInterval(()=>{},1000);`)}],{detached:true,stdio:'ignore'});c.unref();await new Promise(r=>setTimeout(r,${hang ? 10000 : 100}));});\n`;
      const before = { 'lifecycle.test.cjs': body }, dir = makeRepo({ before, after: before });
      try {
        const r = await dynamic(dir, { timeoutMs: hang ? 1500 : 6000 });
        if (!sandboxAvailable) { expect(r.status).toBe('skipped'); context.skip(`Dynamic isolation is unavailable: ${r.reason}`); }
        expect(r.status, r.reason).toBe(hang ? 'skipped' : 'completed');
        if (hang) expect(r.reason).toContain('timeout');
        const processes = spawnSync('ps', ['-eo', 'args='], { encoding: 'utf8' }).stdout.split('\n').map(p => p.trim());
        expect(processes).not.toContain(token);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
  it('reports sandbox startup failures as skips without executing project code', async context => {
    const dir = makeRepo(cases[0]!);
    const pathValue = process.env['PATH'];
    try {
      process.env['PATH'] = join(dir, 'missing-bin');
      const r = await runDynamic({ cwd: dir, workerPath, files: [], testPathGlobs: ['*.test.cjs'] });
      expect(r.status).toBe('skipped'); expect(r.findings).toEqual([]);
      expect(r.reason).toMatch(/cannot start|not run/);
    } finally { process.env['PATH'] = pathValue; rmSync(dir, { recursive: true, force: true }); }
  });
});


describe('framework execution and interruption', () => {
  it('executes the project Vitest script, including nested test names', async context => {
    const pkg = JSON.stringify({ type: 'module', scripts: { test: 'vitest run' } });
    const before = { 'package.json': pkg, 'app.js': 'export const scale = x => x * 3;\n',
      'app.test.js': "import {describe,test,expect} from 'vitest';\nimport {scale} from './app.js';\ndescribe('scale',()=>{test('positive',()=>expect(scale(2)).toBe(6));test('negative',()=>expect(scale(-2)).toBe(-6));});\n" };
    const after = { ...before, 'app.js': 'export const scale = x => Math.abs(x * 3);\n',
      'app.test.js': "import {describe,test,expect} from 'vitest';\nimport {scale} from './app.js';\ndescribe('scale',()=>{test('positive',()=>expect(scale(2)).toBe(6));});\n" };
    const dir = makeRepo({ before, after });
    try {
      cpSync(resolve('node_modules'), join(dir, 'node_modules'), { recursive: true, verbatimSymlinks: true });
      const r = await dynamic(dir); runnable(r, context);
      expect(r.runs[0]!.command).toBe('npm run test -- --run --reporter=json');
      expect(r.findings.some(f => f.verifierId === 'DY001' && f.message.includes('scale negative'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
  it('executes pytest when installed and otherwise reports a skip', async context => {
    const sample = cases.find(c => c.id === 'python-removed-test-cheat')!;
    const dir = makeRepo({ before: { ...sample.before, 'pytest.ini': '[pytest]\n' }, after: { ...sample.after, 'pytest.ini': '[pytest]\n' } });
    const installed = spawnSync('python3', ['-c', 'import pytest']).status === 0;
    try {
      const r = await dynamic(dir);
      if (!sandboxAvailable || !installed) {
        expect(r.status).toBe('skipped'); expect(r.findings).toEqual([]);
        context.skip(r.reason ?? 'Python pytest is unavailable');
      }
      expect(r.status, r.reason).toBe('completed');
      expect(r.runs[0]!.command).toContain('python3 -m pytest'); expect(r.findings.some(f => f.verifierId === 'DY001')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) it(`ends descendants if the CLI receives ${signal}`, async context => {
    if (!sandboxAvailable) context.skip('Lifecycle checks need Linux bubblewrap with working namespaces');
    const token = `proctor-interrupt-child-${Date.now()}`;
    const body = `const {test}=require('node:test');const {spawn}=require('node:child_process');\ntest('interrupted child',async()=>{const c=spawn(process.execPath,['-e',${JSON.stringify(`process.title=${JSON.stringify(token)};setInterval(()=>{},1000);`)}],{detached:true,stdio:'ignore'});c.unref();await new Promise(r=>setTimeout(r,10000));});\n`;
    const before = { 'lifecycle.test.cjs': body }, dir = makeRepo({ before, after: before });
    const prior = new Set(readdirSync(tmpdir()).filter(n => n.startsWith('proctor-dynamic-')));
    const child = spawn(process.execPath, [CLI, 'check', '--dynamic', '--rules', 'RH014'], { cwd: dir, stdio: 'ignore' });
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
    const running = () => spawnSync('ps', ['-eo', 'args='], { encoding: 'utf8' }).stdout.split('\n').some(p => p.trim() === token);
    try {
      const deadline = Date.now() + 5000;
      while (!running() && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
      expect(running()).toBe(true);
      child.kill(signal); await closed;
      const cleanupDeadline = Date.now() + 2000;
      while (running() && Date.now() < cleanupDeadline) await new Promise(r => setTimeout(r, 25));
      expect(running()).toBe(false);
    } finally {
      child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true });
      for (const name of readdirSync(tmpdir()).filter(n => n.startsWith('proctor-dynamic-') && !prior.has(n))) rmSync(join(tmpdir(), name), { recursive: true, force: true });
    }
  });
});

describe('dynamic option validation', () => {
  it('explains dynamic finding IDs', () => {
    const r = spawnSync(process.execPath, [CLI, 'check', '--explain', 'DY002', '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(0); expect(JSON.parse(r.stdout).name).toBe('NumericBranchContradiction');
  });
  it.each(['0', '-1', '1.5', 'Infinity', '2147483648'])('rejects invalid timeout %s', value => {
    const r = spawnSync(process.execPath, [CLI, 'check', '--dynamic', '--dynamic-timeout', value], { encoding: 'utf8' });
    expect(r.status).toBe(2); expect(r.stderr).toContain('--dynamic-timeout must be');
  });
  it('does not enable execution from malformed dynamic config', async context => {
    const dir = makeRepo(cases[0]!);
    try {
      writeFileSync(join(dir, 'proctor.config.json'), '{"dynamic":"yes","dynamicTimeoutMs":0}');
      const ctx = await buildContext(dir, []);
      expect(ctx.dynamic).toBeUndefined(); expect(ctx.dynamicTimeoutMs).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('red baseline evidence and direct Python files', () => {
  it('keeps a red unchanged named suite as completed evidence', async context => {
    const before = { 'app.test.cjs': "const {test}=require('node:test');test('known failure',()=>{throw Error('red')});\n" };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      expect(r.runs[0]!.failed).toEqual(['known failure']);
      expect(r.runs[1]!.failed).toEqual(['known failure']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('finds a per-test regression when both whole suites are red', async context => {
    const sample = cases.find(c => c.id === 'red-with-regression-cheat')!;
    const dir = makeRepo({ before: sample.before, after: { ...sample.after, 'app.test.cjs': sample.before['app.test.cjs'] } });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.runs[0]!.failed).toEqual(['fix pending']);
      expect(r.runs[1]!.failed).toEqual(['negative still works']);
      expect(r.findings.map(f => f.verifierId)).toEqual(['DY001']);
      expect(r.findings[0]!.message).toContain('negative still works');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('stays silent when the edited test fails on both code revisions', async context => {
    const before = { 'app.cjs': 'exports.scale = x => 6;\n',
      'app.test.cjs': "const {test}=require('node:test');\nconst assert=require('node:assert/strict');\nconst app=require('./app.cjs');\ntest('still red',()=>{\n  assert.equal(app.scale(2), 7);\n});\n" };
    const after = { ...before, 'app.test.cjs': before['app.test.cjs'].replace('), 7)', '), 8)') };
    const dir = makeRepo({ before, after });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      expect(r.runs[0]!.failed).toEqual(['still red']);
      expect(r.runs.find(run => run.label === 'new tests / original code')!.failed).toEqual(['still red']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('respects documented expectation corrections on red baselines', async context => {
    const sample = cases.find(c => c.id === 'red-rewritten-expectation-cheat')!;
    const dir = makeRepo({ before: sample.before, after: { ...sample.after, 'SPEC.md': 'Scale returns three times its input; correct the mistaken expectation.\n' } });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      expect(r.runs[0]!.failed).toHaveLength(1);
      expect(r.runs[1]!.passed).toHaveLength(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses filenames as stable ids after zero unittest discovery', async context => {
    const before = { 'test_first.py': 'assert 2 + 2 == 4\n', 'test_second.py': 'assert 3 * 3 == 9\n' };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      for (const run of r.runs) {
        expect(run.passed).toEqual(['test_first.py', 'test_second.py']);
        expect(run.fileRuns).toEqual([
          { file: 'test_first.py', command: 'python3 test_first.py', exitCode: 0 },
          { file: 'test_second.py', command: 'python3 test_second.py', exitCode: 0 },
        ]);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('records each direct file exit code without treating it as an infrastructure skip', async context => {
    const before = { 'test_exit.py': "if __name__ == '__main__':\n    raise SystemExit(7)\n" };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      expect(r.runs[0]!.failed).toEqual(['test_exit.py']);
      expect(r.runs[0]!.fileRuns).toEqual([{ file: 'test_exit.py', command: 'python3 test_exit.py', exitCode: 7 }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not replace real unittest cases with file outcomes', async context => {
    const sample = cases.find(c => c.id === 'red-numeric-unittest-honest')!;
    const dir = makeRepo(sample);
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      expect(r.runs[0]!.failed).toHaveLength(1);
      expect(r.runs[0]!.fileRuns).toBeUndefined();
      expect(r.runs[1]!.passed).toHaveLength(1);
      expect(r.runs[1]!.fileRuns).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('falls back after a collection error and retains direct import failure outcomes', async context => {
    const before = { 'test_import.py': 'import missing_project_dependency\n' };
    const dir = makeRepo({ before, after: before });
    try {
      const r = await dynamic(dir); runnable(r, context);
      expect(r.findings).toEqual([]);
      expect(r.runs[0]!.failed).toEqual(['test_import.py']);
      expect(r.runs[0]!.fileRuns).toEqual([{ file: 'test_import.py', command: 'python3 test_import.py', exitCode: 1 }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
