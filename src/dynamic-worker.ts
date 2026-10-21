import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import picomatch from 'picomatch';
import { loadSnapshots, materialize, type Snapshot } from './dynamic/snapshots.js';
import { detectAdapter, runTests } from './dynamic/adapters.js';
import { documentedIntent, expectedEdits, expectationChanges, expectationOnlyEdit, findProbes, locateTest } from './dynamic/signals.js';
import type { DynamicOptions, DynamicResult, TestRun } from './dynamic/runner.js';
import type { Finding } from './types.js';

const options = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as DynamicOptions;
const scratch = dirname(process.argv[2]!);
const result: DynamicResult = { status: 'completed', findings: [], runs: [], notes: [], elapsedMs: 0 };
function evidence(...runs: TestRun[]): string {
  return runs.map(r => `${r.label}: \`${r.command}\`, exit ${r.exitCode}, ${r.passed.length} passed, ${r.failed.length} failed${r.failed.length ? ` (${r.failed.join(', ')})` : ''}`).join('; ');
}
function finding(id: string, file: string, message: string, runs: TestRun[], line = 1): void {
  result.findings.push({ verifierId: id, severity: 'warn', file, line, message: `${message} Evidence: ${evidence(...runs)}.`, suggestion: 'Review the observed behavior and add a focused regression test. Runtime evidence cannot establish intent.' });
}
try {
  const { old, next } = loadSnapshots(options);
  const isTest = picomatch(options.testPathGlobs, { dot: true });
  const oldTests = [...old.keys()].filter(p => isTest(p)), nextTests = [...next.keys()].filter(p => isTest(p));
  const adapter = detectAdapter(old, oldTests);
  const nextAdapter = detectAdapter(next, nextTests);
  if (adapter.kind !== nextAdapter.kind) throw Error('not run: test framework changed');
  if ([...next.keys()].some(p => !isTest(p) && /\.(?:go|rs|java|rb|php|cs|kt|cpp|c|swift)$/.test(p) && old.get(p)?.data.toString() !== next.get(p)?.data.toString())) {
    result.notes.push('not run: probes for languages other than Node JavaScript and Python');
  }
  function run(tree: Snapshot, label: string): { run: TestRun; dir: string } {
    const dir = join(scratch, `run-${result.runs.length + 1}`);
    materialize(tree, dir, options.cwd);
    const runAdapter = detectAdapter(tree, [...tree.keys()].filter(p => isTest(p)));
    const testRun = runTests(runAdapter, dir, label);
    result.runs.push(testRun);
    return { run: testRun, dir };
  }
  const original = run(old, 'original tests / original code').run;
  if (original.exitCode !== 0 || original.failed.length) throw Error('original test suite is not green');
  const current = run(next, 'new tests / new code');
  const testChanges = [...new Set([...oldTests, ...nextTests])].filter(p => old.get(p)?.data.toString() !== next.get(p)?.data.toString());
  const changedSource = [...new Set([...old.keys(), ...next.keys()])].some(p => !isTest(p) && !/\.(?:md|rst|txt)$/i.test(p) && old.get(p)?.data.toString() !== next.get(p)?.data.toString());
  const intent = documentedIntent(old, next);
  const edits = testChanges.filter(p => expectedEdits(old.get(p)?.data.toString() ?? '', next.get(p)?.data.toString() ?? ''));
  function withTests(source: Snapshot, tests: Snapshot): Snapshot {
    const hybrid = new Map(source);
    for (const p of new Set([...oldTests, ...nextTests])) hybrid.delete(p);
    for (const [p, data] of tests) if (isTest(p)) hybrid.set(p, data);
    return hybrid;
  }
  const cross = testChanges.length ? run(withTests(next, old), 'original tests / new code').run : current.run;
  if (current.run.exitCode === 0 && !intent) {
    for (const id of cross.failed.filter(id => original.passed.includes(id))) {
      const file = locateTest(id, old, oldTests);
      if (file && !edits.includes(file)) finding('DY001', file, `Previously passing original test ${JSON.stringify(id)} fails against the new code`, [original, current.run, cross]);
    }
  }
  let reverse: TestRun | undefined;
  if (testChanges.length) {
    reverse = run(withTests(old, next), 'new tests / original code').run;
    const both = current.run.passed.filter(id => reverse!.passed.includes(id));
    if (both.length) result.notes.push(`${both.length} named tests passed on both code revisions. This alone does not show that changed tests exercise the change and is not a finding.`);
    if (!changedSource && !intent && testChanges.length === 1 && edits.length && expectationOnlyEdit(old.get(edits[0]!)?.data.toString() ?? '', next.get(edits[0]!)?.data.toString() ?? '') && reverse.failed.length && /AssertionError|AssertionError:|Expected|expected|Assertion failed/.test(reverse.detail)) {
      for (const id of reverse.failed.filter(id => original.passed.includes(id))) {
        const file = locateTest(id, old, oldTests);
        if (file && edits.includes(file)) finding('DY003', file, `Only the expected literal changed (${expectationChanges(old.get(file)?.data.toString() ?? '', next.get(file)?.data.toString() ?? '').map(e => `${e.before} to ${e.after}`).join(', ')}): original test ${JSON.stringify(id)} passed with the old expected value on original code and the edited test fails on that same code`, [original, current.run, reverse]);
      }
    }
  }
  // Probe only when tests are unchanged and both complete suites pass. An added test or spec
  // can intentionally introduce an exception, so this prototype gives it the benefit of doubt.
  if (current.run.exitCode === 0 && !testChanges.length && !intent) {
    for (const probe of findProbes(old, next, isTest)) {
      const values = [probe.input - 1, probe.input, probe.input + 1];
      const observed: number[][] = [];
      const probeRuns: TestRun[] = [];
      for (const [tree, label] of [[old, 'probe / original code'], [next, 'probe / new code']] as const) {
        const dir = join(scratch, `probe-${result.runs.length + 1}`);
        materialize(tree, dir, options.cwd);
        let command: string, args: string[];
        if (probe.language === 'js') {
          const script = `const m=await import(${JSON.stringify('./' + probe.file)});const f=m[${JSON.stringify(probe.name)}]??m.default?.[${JSON.stringify(probe.name)}];console.log(JSON.stringify(${JSON.stringify(values)}.map(x=>f(x))));`;
          writeFileSync(join(dir, '.proctor-probe.mjs'), script);
          command = process.execPath; args = ['.proctor-probe.mjs'];
        } else {
          const script = `import importlib.util,json\ns=importlib.util.spec_from_file_location('probe',${JSON.stringify(probe.file)})\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\nprint(json.dumps([getattr(m,${JSON.stringify(probe.name)})(x) for x in ${JSON.stringify(values)}]))\n`;
          writeFileSync(join(dir, '.proctor-probe.py'), script);
          command = 'python3'; args = ['.proctor-probe.py'];
        }
        const r = spawnSync(command, args, { cwd: dir, encoding: 'utf8', maxBuffer: 128 * 1024 });
        if (r.status !== 0) { observed.length = 0; break; }
        let outputs: number[];
        try { outputs = JSON.parse(r.stdout); } catch { observed.length = 0; break; }
        if (!Array.isArray(outputs) || outputs.length !== 3 || outputs.some(n => typeof n !== 'number' || !Number.isFinite(n))) { observed.length = 0; break; }
        observed.push(outputs);
        const pr: TestRun = { label, command: `${command} ${args.join(' ')} (${probe.file}:${probe.name}, inputs ${JSON.stringify(values)})`, exitCode: 0, passed: [], failed: [], detail: `outputs ${JSON.stringify(outputs)}` };
        result.runs.push(pr); probeRuns.push(pr);
      }
      if (observed.length === 2 && observed[0]![0] === observed[1]![0] && observed[0]![2] === observed[1]![2] && observed[0]![1] !== observed[1]![1]) {
        finding('DY002', probe.file, `Literal branch in ${probe.name} contradicts the original arithmetic reference only at ${probe.input}: old ${JSON.stringify(observed[0])}, new ${JSON.stringify(observed[1])}, inputs ${JSON.stringify(values)}`, [original, current.run, ...probeRuns], probe.line);
      }
    }
  }
  const raceFiles = testChanges.filter(p => /(?:sleep\s*\(|setTimeout\s*\(|\bretry\b|\bretries\b)/.test(next.get(p)?.data.toString() ?? '') &&
    (next.get(p)?.data.toString().match(/sleep\s*\(|setTimeout\s*\(|\bretry\b|\bretries\b/g)?.length ?? 0) > (old.get(p)?.data.toString().match(/sleep\s*\(|setTimeout\s*\(|\bretry\b|\bretries\b/g)?.length ?? 0));
  if (raceFiles.length && current.run.exitCode === 0) {
    const repeats = [current.run];
    for (let i = 1; i <= 3; i++) {
      const repeated = runTests(nextAdapter, current.dir, `new tests / new code repeat ${i}`);
      result.runs.push(repeated); repeats.push(repeated);
    }
    const ids = new Set(repeats.flatMap(r => r.failed));
    for (const id of ids) {
      const file = locateTest(id, next, raceFiles);
      if (file && repeats.some(r => r.passed.includes(id)) && repeats.filter(r => r.failed.includes(id)).length >= 2) {
        finding('DY005', file, `Test ${JSON.stringify(id)} has inconsistent outcomes across four runs after adding a sleep or retry; this can also be order dependence`, repeats);
      }
    }
  }
} catch (error) {
  result.status = 'skipped'; result.reason = String(error).replace(/^Error: /, '');
  result.findings = []; // Incomplete execution never becomes a check failure.
}
process.stdout.write(JSON.stringify(result));
