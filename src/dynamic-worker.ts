import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import picomatch from 'picomatch';
import { loadSnapshots, materialize, type Snapshot } from './dynamic/snapshots.js';
import { detectAdapter, runTests } from './dynamic/adapters.js';
import { documentedIntent, expectedEdits, expectationChanges, expectationOnlyEdit, findProbes, locateTest, probeInputs, type ProbeValue } from './dynamic/signals.js';
import { coverageEnvironment, jsMutations, MUTATION_LIMIT, pythonMutations, readCalls } from './dynamic/mutations.js';
import type { DynamicOptions, DynamicResult, TestRun } from './dynamic/runner.js';
import type { Finding } from './types.js';

const options = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as DynamicOptions;
const scratch = dirname(process.argv[2]!);
const result: DynamicResult = { status: 'completed', findings: [], runs: [], notes: [], elapsedMs: 0 };
function evidence(...runs: TestRun[]): string {
  return runs.map(r => `${r.label}: \`${r.command}\`, exit ${r.exitCode}, ${r.passed.length} passed, ${r.failed.length} failed${r.failed.length ? ` (${r.failed.join(', ')})` : ''}${r.fileRuns ? '; ' + r.fileRuns.map(f => `\`${f.command}\`, exit ${f.exitCode}, file ${f.file}`).join('; ') : ''}`).join('; ');
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
  const current = run(next, 'new tests / new code');
  if (original.failed.length && current.run.exitCode === 0) {
    result.notes.push('Original tests are red and new tests are green. Continue with per-test comparisons and applicable probes; this is a normal fix shape.');
  }
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
  if (!intent) {
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
    if (!changedSource && !intent && testChanges.length === 1 && edits.length && expectationOnlyEdit(old.get(edits[0]!)?.data.toString() ?? '', next.get(edits[0]!)?.data.toString() ?? '')) {
      const rejected = reverse.failed.filter(id => original.passed.includes(id));
      const accepted = reverse.passed.filter(id => original.failed.includes(id));
      for (const id of [...rejected, ...accepted]) {
        const file = locateTest(id, old, oldTests);
        const mismatch = accepted.includes(id)
          ? 'failed with the original expectation, but the edited expectation passes on that same old code; the edit already matches the old behavior'
          : 'passed with the original expectation, but the edited expectation fails on that same old code';
        if (file && edits.includes(file)) finding('DY003', file, `Only the expected literal changed (${expectationChanges(old.get(file)?.data.toString() ?? '', next.get(file)?.data.toString() ?? '').map(e => `${e.before} to ${e.after}`).join(', ')}): test ${JSON.stringify(id)} ${mismatch}`, [original, current.run, reverse]);
      }
    }
  }
  // Probes need unchanged tests and a passing new suite, even when the old suite is red. An added test or spec
  // can intentionally introduce an exception, so this prototype gives it the benefit of doubt.
  if (current.run.exitCode === 0 && !testChanges.length && !intent) {
    for (const probe of findProbes(old, next, isTest)) {
      const values = probeInputs(probe.input);
      const observed: ProbeValue[][] = [];
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
          const script = `import importlib.util,json\ns=importlib.util.spec_from_file_location('probe',${JSON.stringify(probe.file)})\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\nprint(json.dumps([getattr(m,${JSON.stringify(probe.name)})(x) for x in json.loads(${JSON.stringify(JSON.stringify(values))})]))\n`;
          writeFileSync(join(dir, '.proctor-probe.py'), script);
          command = 'python3'; args = ['.proctor-probe.py'];
        }
        const r = spawnSync(command, args, { cwd: dir, encoding: 'utf8', maxBuffer: 128 * 1024 });
        if (r.status !== 0) { observed.length = 0; break; }
        let outputs: ProbeValue[];
        try { outputs = JSON.parse(r.stdout); } catch { observed.length = 0; break; }
        if (!Array.isArray(outputs) || outputs.length !== values.length || outputs.some(n => !['number', 'string', 'boolean'].includes(typeof n) || (typeof n === 'number' && !Number.isFinite(n)))) { observed.length = 0; break; }
        observed.push(outputs);
        const pr: TestRun = { label, command: `${command} ${args.join(' ')} (${probe.file}:${probe.name}, inputs ${JSON.stringify(values)})`, exitCode: 0, passed: [], failed: [], detail: `outputs ${JSON.stringify(outputs)}` };
        result.runs.push(pr); probeRuns.push(pr);
      }
      if (observed.length === 2 && values.every((_, i) => i === 1 || observed[0]![i] === observed[1]![i]) && observed[0]![1] !== observed[1]![1]) {
        finding('DY002', probe.file, `Literal branch in ${probe.name} contradicts the original simple reference only at ${JSON.stringify(probe.input)}: old ${JSON.stringify(observed[0])}, new ${JSON.stringify(observed[1])}, inputs ${JSON.stringify(values)}`, [original, current.run, ...probeRuns], probe.line);
      }
    }
  }
  // A red baseline with unchanged tests is the fix shape where cross-runs have no extra information.
  // Mutations are advisory coverage evidence, limited to functions observed in a separate green run.
  if (original.failed.length && current.run.exitCode === 0 && !testChanges.length && !intent) {
    try {
      const coverage = coverageEnvironment(current.dir);
      const control = runTests(nextAdapter, current.dir, 'new tests / new code coverage control', coverage.env);
      result.runs.push(control);
      const samePasses = (a: TestRun, b: TestRun) => a.exitCode === 0 && b.exitCode === 0 && !a.failed.length && !b.failed.length &&
        a.passed.length > 0 && a.passed.length === b.passed.length && a.passed.every(id => b.passed.includes(id));
      if (samePasses(current.run, control)) {
        const calls = readCalls(coverage.path, current.dir);
        let count = 0;
        for (const [file, entry] of next) {
          if (count >= MUTATION_LIMIT) break;
          if (isTest(file) || !/\.(?:js|mjs|cjs|py)$/.test(file)) continue;
          const before = old.get(file)?.data.toString() ?? '', source = entry.data.toString();
          if (before === source) continue;
          const path = join(current.dir, file);
          const candidates = file.endsWith('.py') ? pythonMutations(before, source, calls.python.get(path) ?? [], current.dir) : jsMutations(before, source, calls.js.get(path) ?? []);
          for (const mutation of candidates) {
            if (count >= MUTATION_LIMIT) break;
            count++;
            let mutant: TestRun | undefined;
            try {
              writeFileSync(path, mutation.source);
              mutant = runTests(nextAdapter, current.dir, `mutation ${count}: ${mutation.operation}, ${file}:${mutation.line} (${mutation.functionName})`);
              result.runs.push(mutant);
            } catch { /* Invalid or unreadable mutant outcomes cannot justify a coverage warning. */ }
            finally { writeFileSync(path, source); }
            if (mutant && samePasses(current.run, mutant)) {
              // Confirm the restored suite is still green before attributing a survivor to missing coverage.
              const restored = runTests(nextAdapter, current.dir, `mutation ${count}: restored control`);
              result.runs.push(restored);
              if (samePasses(current.run, restored)) finding('DY004', file,
                `${mutation.operation} at ${file}:${mutation.line} in called function ${mutation.functionName} left every named test passing; this changed statement has no demonstrated test protection`,
                [original, current.run, control, mutant, restored], mutation.line);
            }
          }
        }
        result.notes.push(`Mutation-lite: ${Math.min(count, MUTATION_LIMIT)} candidates run, cap ${MUTATION_LIMIT}; only parser-confirmed statements in called functions are eligible.`);
      } else result.notes.push('not run: mutation-lite coverage control did not reproduce the green suite');
    } catch (error) { result.notes.push(`not run: mutation-lite could not establish reliable evidence: ${String(error)}`); }
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
