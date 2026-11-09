import { stripVTControlCharacters } from 'node:util';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync, lstatSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from './snapshots.js';
import type { TestRun } from './runner.js';

export interface Adapter { command: string; args: string[]; kind: 'tap' | 'jest' | 'vitest' | 'unittest' | 'pytest'; testFiles?: string[] }
export function detectAdapter(tree: Snapshot, tests: string[]): Adapter {
  const pkgText = tree.get('package.json')?.data.toString();
  if (pkgText) {
    const pkg = JSON.parse(pkgText);
    const script = pkg.scripts?.test;
    if (typeof script === 'string') {
      if (/\bvitest\b/.test(script)) return { command: 'npm', args: ['run', 'test', '--', '--run', '--reporter=json'], kind: 'vitest' };
      if (/\bjest\b/.test(script)) return { command: 'npm', args: ['run', 'test', '--', '--json', '--runInBand', '--watch=false'], kind: 'jest' };
      if (/\bnode\b.*--test\b/.test(script)) return { command: 'npm', args: ['run', 'test'], kind: 'tap' };
      throw Error('not run: unrecognized package test script (node:test, jest and vitest supported)');
    }
  }
  const js = tests.filter(p => /\.(?:mjs|cjs|js)$/.test(p));
  if (js.length) return { command: process.execPath, args: ['--test', '--test-reporter=tap', ...js], kind: 'tap' };
  const py = tests.filter(p => p.endsWith('.py'));
  if (py.length) {
    const pytest = ['pytest.ini', 'conftest.py'].some(p => tree.has(p)) ||
      /\[tool\.pytest/.test(tree.get('pyproject.toml')?.data.toString() ?? '') ||
      py.some(p => /(?:^|\n)\s*(?:import pytest|from pytest\b)/.test(tree.get(p)?.data.toString() ?? ''));
    return pytest
      ? { command: 'python3', args: ['-m', 'pytest', '-q', '--tb=short', '--junitxml=.proctor-junit.xml'], kind: 'pytest' }
      : { command: 'python3', args: ['-m', 'unittest', 'discover', '-v'], kind: 'unittest', testFiles: py };
  }
  throw Error('not run: no supported Node or Python tests found');
}
function uniqueOutcomes(rows: [string, boolean][]): { passed: string[]; failed: string[] } {
  const counts = new Map<string, number>();
  for (const [id] of rows) counts.set(id, (counts.get(id) ?? 0) + 1);
  if ([...counts.values()].some(count => count !== 1)) throw Error('inconclusive: duplicate or conflicting named test results');
  if (rows.some(([id]) => typeof id !== 'string' || !id.trim())) throw Error('inconclusive: unnamed test result');
  return {
    passed: rows.filter(([, pass]) => pass).map(([id]) => id),
    failed: rows.filter(([, pass]) => !pass).map(([id]) => id),
  };
}
export function parseResults(kind: Adapter['kind'], stdout: string, stderr: string, junit = ''): { passed: string[]; failed: string[] } {
  const rows: [string, boolean][] = [];
  if (kind === 'tap') {
    if (/^\s*Bail out!/mi.test(stdout)) throw Error('inconclusive: TAP bailed out');
    const plans = [...stdout.matchAll(/^1\.\.(\d+)(?:\s*#.*)?\s*$/gm)];
    const rootResults = [...stdout.matchAll(/^(?:not )?ok \d+ - /gm)];
    if (plans.length > 1 || (plans.length === 1 && Number(plans[0]![1]) !== rootResults.length)) throw Error('inconclusive: TAP plan disagrees with root test results');
    for (const match of stdout.matchAll(/^\s*(not )?ok \d+ - (.+?)(?: #.*)?$/gm)) {
      if (/ # (?:SKIP|TODO)/i.test(match[0])) continue;
      rows.push([match[2]!.trim(), !match[1]]);
    }
  } else if (kind === 'unittest') {
    for (const match of stderr.matchAll(/^(.+? \(.+?\)) \.\.\. (ok|FAIL|ERROR)\s*$/gm)) rows.push([match[1]!, match[2] === 'ok']);
  } else if (kind === 'pytest') {
    if (!/<testsuites?\b/.test(junit) || !/<\/testsuites?>/.test(junit) || /<!DOCTYPE|<!ENTITY/i.test(junit)) throw Error('inconclusive: missing or unsupported JUnit document');
    const opened = [...junit.matchAll(/<testcase\b/g)].length;
    let parsed = 0;
    let failures = 0;
    let errors = 0;
    let skipped = 0;
    const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    for (const m of junit.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      parsed++;
      if (/<failure\b/.test(m[2] ?? '')) failures++;
      if (/<error\b/.test(m[2] ?? '')) errors++;
      if (/<skipped\b/.test(m[2] ?? '')) { skipped++; continue; }
      const cls = /\bclassname="([^"]*)"/.exec(m[1]!)?.[1];
      const name = /\bname="([^"]*)"/.exec(m[1]!)?.[1];
      if (!name) throw Error('inconclusive: unnamed JUnit testcase');
      if (name) rows.push([decode(`${cls ?? ''}::${name}`), !/<(?:failure|error)\b/.test(m[2] ?? '')]);
    }
    if (opened !== parsed) throw Error('inconclusive: truncated JUnit testcase');
    const root = /^\s*(?:<\?xml[^>]*>\s*)?<testsuites?\b([^>]*)>/.exec(junit);
    for (const [key, count] of Object.entries({ tests: parsed, failures, errors, skipped })) {
      const value = new RegExp(`\\b${key}="([^"]*)"`).exec(root?.[1] ?? '')?.[1];
      if (value !== undefined && (!/^\d+$/.test(value) || Number(value) !== count)) throw Error(`inconclusive: JUnit ${key} disagrees with testcase outcomes`);
    }
  } else {
    // npm and lifecycle scripts can print text before the runner's JSON object.
    let result;
    let reports = 0;
    for (const stream of [stdout, stderr]) {
      const start = stream.indexOf('{'), end = stream.lastIndexOf('}');
      if (start < 0 || end < start) continue;
      try {
        const candidate = JSON.parse(stream.slice(start, end + 1));
        if (Array.isArray(candidate.testResults)) { result = candidate; reports++; }
      } catch { /* The other stream may hold the structured reporter. */ }
    }
    if (reports > 1) throw Error('inconclusive: multiple structured test reports');
    if (!result) throw Error('inconclusive: test reporter did not produce readable JSON');
    let total = 0;
    let pending = 0;
    for (const suite of result.testResults ?? []) {
      if (!Array.isArray(suite.assertionResults)) throw Error('inconclusive: missing assertion results');
      for (const test of suite.assertionResults) {
        total++;
        if (!['passed', 'failed', 'pending', 'skipped', 'todo', 'disabled'].includes(test.status)) throw Error('inconclusive: unsupported test outcome');
        if (test.status !== 'passed' && test.status !== 'failed') pending++;
        if (test.status === 'passed' || test.status === 'failed') rows.push([test.fullName ?? [...(test.ancestorTitles ?? []), test.title].join(' '), test.status === 'passed']);
      }
    }
    const counts: Record<string, number> = {
      numTotalTests: total, numPassedTests: rows.filter(([, pass]) => pass).length,
      numFailedTests: rows.filter(([, pass]) => !pass).length, numPendingTests: pending,
    };
    for (const [key, count] of Object.entries(counts)) {
      if (result[key] !== undefined && result[key] !== count) throw Error(`inconclusive: reporter ${key} disagrees with named results`);
    }
    if (result.success === true && rows.some(([, pass]) => !pass)) throw Error('inconclusive: success summary contradicts named failures');
  }
  return uniqueOutcomes(rows);
}
const PYTHON_FUNCTIONS = `import ast,json,sys
tree=ast.parse(open(sys.argv[1],encoding='utf-8').read())
print(json.dumps([n.name for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name.startswith('test_')]))
`;
const PYTHON_CALL = `import asyncio,importlib.util,inspect,os,sys
file,name=sys.argv[1:]
sys.path.insert(0,os.path.dirname(os.path.abspath(file)))
spec=importlib.util.spec_from_file_location('proctor_test',file)
module=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=module
spec.loader.exec_module(module)
result=getattr(module,name)()
if inspect.isawaitable(result): asyncio.run(result)
`;
function runPythonFiles(adapter: Adapter, dir: string, label: string, discovery: string, env: NodeJS.ProcessEnv): TestRun {
  if (!adapter.testFiles?.length) throw Error(`cannot run ${label}: no Python files for direct execution`);
  const passed: string[] = [], failed: string[] = [], details: string[] = [];
  const fileRuns: NonNullable<TestRun['fileRuns']> = [];
  const helper = '.proctor-python-test.py';
  writeFileSync(join(dir, helper), PYTHON_CALL);
  for (const file of adapter.testFiles) {
    const collected = spawnSync(adapter.command, ['-c', PYTHON_FUNCTIONS, file], { cwd: dir, encoding: 'utf8', maxBuffer: 128 * 1024, env });
    if (collected.error || collected.signal) throw Error(`cannot inspect ${file}: ${collected.error?.message ?? collected.signal}`);
    // Syntax and import errors still get an actual direct-file outcome, rather than a synthetic pass.
    const names: string[] = collected.status === 0 ? JSON.parse(collected.stdout) : [];
    if (new Set(names).size !== names.length) throw Error(`cannot run ${label}: duplicate Python function names in ${file}`);
    const invocations = names.length ? names.map(name => ({ id: `${file}::${name}`, args: [helper, file, name] })) : [{ id: file, args: [file] }];
    for (const { id, args } of invocations) {
      const r = spawnSync(adapter.command, args, { cwd: dir, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, env });
      if (r.error || r.signal || r.status === null) throw Error(`cannot run ${label}, ${file}: ${r.error?.message ?? r.signal ?? 'no exit code'}`);
      fileRuns.push({ file: id, command: [adapter.command, ...args].join(' '), exitCode: r.status });
      (r.status === 0 ? passed : failed).push(id);
      details.push(`${id}: exit ${r.status}\n${r.stdout ?? ''}${r.stderr ?? ''}`);
    }
  }
  return { label, command: `${adapter.command} -m unittest discover -v, then direct Python files`, exitCode: failed.length ? 1 : 0,
    passed, failed, fileRuns, detail: stripVTControlCharacters(`${discovery}\n${details.join('\n')}`).slice(-1200) };
}
export function runTests(adapter: Adapter, dir: string, label: string, extraEnv: NodeJS.ProcessEnv = {}): TestRun {
  const artifact = join(dir, '.proctor-junit.xml');
  if (adapter.kind === 'pytest') rmSync(artifact, { force: true });
  const env = { ...process.env, ...extraEnv, PWD: dir, ...(adapter.kind === 'tap' && adapter.command === 'npm' ? { NODE_OPTIONS: '--test-reporter=tap' } : {}) };
  const r = spawnSync(adapter.command, adapter.args, { cwd: dir, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, env });
  if (r.error || r.signal) throw Error(`cannot run ${label}: ${r.error?.message ?? r.signal}`);
  const stdout = r.stdout ?? '', stderr = r.stderr ?? '';
  let junit = '';
  if (adapter.kind === 'pytest') {
    try {
      if (!lstatSync(artifact).isFile()) throw Error('unsafe reporter artifact');
      const fd = openSync(artifact, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw Error('unsafe reporter artifact');
        junit = readFileSync(fd, 'utf8');
      } finally { closeSync(fd); }
    } catch { throw Error(`inconclusive: ${label} did not produce a bounded regular JUnit artifact`); }
  }
  const outcomes = parseResults(adapter.kind, stdout, stderr, junit);
  if (adapter.kind === 'unittest') {
    const real = [...outcomes.passed, ...outcomes.failed].filter(id => !id.includes('unittest.loader._FailedTest'));
    const discovered = Number(/^Ran (\d+) tests? in /m.exec(stderr)?.[1] ?? 0);
    const collectionFailed = outcomes.failed.some(id => id.includes('unittest.loader._FailedTest'));
    // Prefer real unittest cases. With no collected cases, any discovery error may hide plain scripts.
    if (!real.length && (discovered === 0 || collectionFailed)) return runPythonFiles(adapter, dir, label, stdout + stderr, env);
    if (collectionFailed) throw Error(`cannot run ${label}: unittest collection failed beside real cases`);
  }
  if (outcomes.passed.length + outcomes.failed.length === 0) throw Error(`cannot run ${label}: no named test results (exit ${r.status}); ${String(stdout + stderr).replace(/\s+/g, ' ').slice(-300)}`);
  if (r.status !== 0 && outcomes.failed.length === 0) throw Error(`cannot run ${label}: command exited ${r.status} without a named failing test`);
  if (r.status === 0 && outcomes.failed.length) throw Error(`cannot run ${label}: reporter and exit code disagree`);
  return { label, command: (adapter.kind === 'tap' && adapter.command === 'npm' ? 'NODE_OPTIONS=--test-reporter=tap ' : '') + [adapter.command, ...adapter.args].join(' '), exitCode: r.status, ...outcomes,
    detail: stripVTControlCharacters(String(stdout + stderr)).slice(-1200) };
}
