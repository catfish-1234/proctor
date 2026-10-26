import { afterAll, beforeAll, describe, expect, it, vi, type TestContext } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyBehavior, stableSweeps, type BehaviorUnit, type Sweep } from '../src/dynamic/behavior.js';
import { behaviorInputsInDomain, classifyDocumentation, documentationRules, documentationSentences, type DocumentRule } from '../src/dynamic/documentation.js';
import { judgePrompt, parseJudgeVerdict } from '../src/dynamic/judge-protocol.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';
// @ts-expect-error standard-library tuned development twins
import cases from '../bench/dynamic-dev/hardening-cases.mjs';
// @ts-expect-error isolated development driver with fake commands only
import { checkJudge } from '../bench/dynamic-dev/judge-run.mjs';

const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([file, source]) => [file, { data: Buffer.from(source), mode: 0o644 }]));
const names = new Set(['compute']);
const sentences = (text: string, files = ['src/app.cjs']) => {
  const snapshot = tree({ 'README.md': text });
  return documentationSentences(snapshot, snapshot, names, files);
};

describe('broad candidates with strict runtime claims', () => {
  it('collects unit and file mentions without requiring a recognized verb or signature', () => {
    for (const text of ['The compute result is a sequence.', 'The app.compute result is a sequence.', 'The app.cjs result is a sequence.', 'The src/app.cjs result is a sequence.']) {
      expect(sentences(text)).toHaveLength(1);
      const snapshot = tree({ 'README.md': text });
      expect(documentationRules(snapshot, snapshot)).toEqual([]);
    }
    expect(sentences('An unrelated precompute helper is convenient.')).toEqual([]);
    expect(sentences('The other.api.compute result is a sequence.')).toEqual([]);
    expect(sentences('The app.cjs result is a sequence.', ['src/app.cjs', 'other/app.cjs'])).toEqual([]);
    expect(sentences('The src/app.cjs result is a sequence.', ['src/app.cjs', 'other/app.cjs'])).toMatchObject([{ sourceFile: 'src/app.cjs' }]);
    const snapshot = tree({ 'README.md': 'The $compute result is a sequence.' });
    expect(documentationSentences(snapshot, snapshot, new Set(['$compute']))).toMatchObject([{ name: '$compute' }]);
  });
  it('preserves exact supplied sentences, wrapped prose, literal arguments and line locations', () => {
    const quote = 'The app.compute result is an increasing sequence\nwith repeats intact.';
    expect(sentences('An overview.\n' + quote)).toMatchObject([{ quote, line: 2, name: 'compute', module: 'app' }]);
    expect(sentences('Overview. `app.compute(-1.8)` is the calibration call.')).toMatchObject([{ quote: '`app.compute(-1.8)` is the calibration call.', args: [-1.8], arity: 1 }]);
    expect(sentences('Overview. In src/app.cjs, everything is calibrated.')).toMatchObject([{ quote: 'In src/app.cjs, everything is calibrated.' }]);
  });
  it('retains the unchanged-file, file-size, file-count and sentence-count caps', () => {
    const quote = 'The compute result is a sequence.\n';
    const files = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`docs/${i}.md`, quote]));
    const old = tree(files), next = tree(files);
    expect(documentationSentences(old, next, names)).toHaveLength(20);
    next.get('docs/0.md')!.mode = 0o755;
    next.get('docs/1.md')!.data = Buffer.from(quote + 'Changed.');
    expect(documentationSentences(old, next, names)).toHaveLength(19);
    expect(sentences(quote + ' '.repeat(64 * 1024))).toEqual([]);
    expect(sentences(Array.from({ length: 40 }, (_, i) => `The compute result has property ${i}.`).join('\n'))).toHaveLength(32);
    expect(sentences('The compute result ' + 'x'.repeat(501))).toEqual([]);
  });
  it('does not let unrelated files consume changed-unit candidates', () => {
    const snapshot = tree({ 'README.md': 'The old.cjs implementation is documented. The app.cjs implementation is documented.' });
    expect(documentationSentences(snapshot, snapshot, names, ['old.cjs', 'app.cjs'], new Set(['app.cjs']))).toMatchObject([{ sourceFile: 'app.cjs' }]);
  });
  it('keeps exact quotes, fixed claims, four sentences and bounded prompts mandatory', () => {
    const request = { name: 'compute', arity: 1, before: 'x=>x', after: 'x=>x+1', sentences: ['The compute result is useful.'] };
    expect(judgePrompt(request)).toBeDefined();
    expect(parseJudgeVerdict(JSON.stringify({ violation: 'unclear', quote: request.sentences[0], claim: null }), request)).toBeDefined();
    expect(parseJudgeVerdict(JSON.stringify({ violation: 'yes', quote: 'A different sentence.', claim: { kind: 'sign' } }), request)).toBeUndefined();
    expect(parseJudgeVerdict(JSON.stringify({ violation: 'yes', quote: request.sentences[0], claim: { kind: 'arbitrary' } }), request)).toBeUndefined();
    expect(judgePrompt({ ...request, sentences: Array(5).fill(request.sentences[0]) })).toBeUndefined();
    expect(judgePrompt({ ...request, after: 'x'.repeat(2000) })).toBeUndefined();
  });
});

describe('stable blocking evidence on both revisions', () => {
  const unit: BehaviorUnit = { file: 'app.cjs', name: 'compute', language: 'js', line: 1, fixtures: [], inputs: [[[2, 1]], [[10, 2]]] };
  const rule: DocumentRule = { file: 'SPEC.md', line: 1, quote: 'Contract', name: 'compute', arity: 1, kind: 'ascending', confidence: 'precise' };
  const run = (values: unknown[]): Sweep => ({ outcomes: values.map(value => ({ value })), run: { label: 'fresh', command: 'node input', exitCode: 0, passed: [], failed: [], detail: '' } });
  const claim = { args: [[2, 1]], expected: [1, 2], file: 'app.test.cjs', line: 3, test: 'added order' };
  it('does not turn expanded tests on a legacy implementation into blocking evidence', () => {
    const before = run([[1, 2], [10, 2]]), after = run([[1, 2], []]);
    expect(classifyDocumentation(unit, [rule], [before, before, after, after], [claim], false)).toEqual([]);
    expect(classifyDocumentation(unit, [rule], [before, before, before, before], [claim], false)).toEqual([]);
  });
  it('requires the violating result itself to change when relying on an added claim', () => {
    const before = run([[], []]), partial = run([[1, 2], []]), shortcut = run([[1, 2], [10, 2]]);
    expect(classifyDocumentation(unit, [rule], [before, before, partial, partial], [claim], false)).toEqual([]);
    expect(classifyDocumentation(unit, [rule], [before, before, shortcut, shortcut], [claim], false)).toMatchObject([{ blocking: true }]);
  });
  it('does not equate a renamed legacy exception with a new contract violation', () => {
    const before = run([[], []]), after = run([[1, 2], []]);
    before.outcomes[1] = { error: 'RangeError' }; after.outcomes[1] = { error: 'TypeError' };
    expect(classifyDocumentation(unit, [rule], [before, before, after, after], [claim], false)).toEqual([]);
    before.outcomes[1] = { value: [2, 10] };
    expect(classifyDocumentation(unit, [rule], [before, before, after, after], [], false)).toMatchObject([{ blocking: true }]);
  });
  for (const revision of [0, 1, 2, 3]) it(`rejects incomplete or unsuccessful evidence in run ${revision + 1}`, () => {
    const before = run([[1, 2], [2, 10]]), after = run([[1, 2], [10, 2]]);
    for (const failure of ['missing outcome', 'exit code', 'input process exit', 'missing process']) {
      const runs = structuredClone([before, before, after, after]);
      if (failure === 'missing outcome') runs[revision]!.outcomes.pop();
      if (failure === 'exit code') runs[revision]!.run.exitCode = 1;
      if (failure === 'input process exit') runs[revision]!.run.fileRuns = [{ file: unit.file, command: 'node input', exitCode: 1 }, { file: unit.file, command: 'node input', exitCode: 0 }];
      if (failure === 'missing process') runs[revision]!.run.fileRuns = [];
      expect(stableSweeps(unit, runs)).toBe(false);
      expect(classifyDocumentation(unit, [rule], runs, [], false)).toEqual([]);
      expect(classifyBehavior(unit, runs)).toEqual([]);
    }
  });
  it('does not use unsupported values or inconsistent helper exits to prove a contract violation', () => {
    const marked = { ...unit, contract: { file: 'app.test.cjs', name: 'verify', preamble: '', source: '' } };
    const before = run([[1, 2], [2, 10]]), after = run([[1, 2], [10, 2]]);
    before.outcomes.forEach(o => { o.contract = 'pass'; o.contractExit = 0; });
    after.outcomes.forEach(o => { o.contract = 'assertion'; o.contractExit = 1; });
    expect(classifyBehavior(marked, [before, before, after, after])).toMatchObject([{ kind: 'contract' }]);
    after.outcomes.forEach(o => { o.unsupported = true; });
    expect(classifyBehavior(marked, [before, before, after, after])).toEqual([]);
    after.outcomes.forEach(o => { delete o.unsupported; o.contractExit = 2; });
    expect(classifyBehavior(marked, [before, before, after, after]).every(s => s.kind !== 'contract')).toBe(true);
  });
});

describe('documented domains for advisory sweeps', () => {
  const unit: BehaviorUnit = { file: 'app.cjs', name: 'compute', language: 'js', line: 1, fixtures: [['a', 2]], inputs: [['a', 2], ['a', 0], ['a', 2147483647]] };
  const rule: DocumentRule = { file: 'SPEC.md', line: 1, quote: 'Padding contract', name: 'compute', arity: 2, kind: 'pad', confidence: 'precise' };
  it('reuses the supported guarded domain instead of allocating at an unsupported width', () => {
    expect(behaviorInputsInDomain(unit, [rule])).toEqual([['a', 2]]);
  });
  it('does not infer a general domain from an example, ambiguous prose or a marked helper', () => {
    const point = { ...rule, kind: 'example' as const, args: ['a', 2], expected: '.a' };
    expect(behaviorInputsInDomain(unit, [point])).toBe(unit.inputs);
    expect(behaviorInputsInDomain(unit, [{ ...rule, confidence: 'advisory' }])).toBe(unit.inputs);
    expect(behaviorInputsInDomain({ ...unit, contract: { file: 'app.test.cjs', name: 'verify', preamble: '', source: '' } }, [rule])).toBe(unit.inputs);
  });
  it('keeps integer boundaries for unannotated and applicable numeric units', () => {
    const numeric = { ...unit, inputs: [[0], [1], [2147483647], [-2147483648]] };
    expect(behaviorInputsInDomain(numeric, [])).toBe(numeric.inputs);
    expect(behaviorInputsInDomain(numeric, [{ ...rule, kind: 'sign', arity: 1 }])).toEqual([[1], [2147483647], [-2147483648]]);
  });
});

let suiteTemp: string;
beforeAll(() => {
  suiteTemp = mkdtempSync(join(tmpdir(), 'proctor-hardening-suite-'));
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(key, suiteTemp);
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(suiteTemp, { recursive: true, force: true }); });
const available = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;
function runnable(context: TestContext) { if (!available) context.skip('Dynamic checks require Linux and working bubblewrap namespaces.'); }
type Sample = { id: string; label: string; expected: string[]; expectedBlocking: string[]; expectedAdvisory?: string[] };
describe('tuned shortcut and honest repair twins', () => {
  for (const sample of cases as Sample[]) it(sample.id, context => {
    runnable(context);
    const result = checkJudge(sample);
    expect(result.skipped, result.stderr).toBe(false);
    expect(result.found, result.stderr).toEqual(sample.expected);
    expect(result.blocking, result.stderr).toEqual(sample.expectedBlocking);
    for (const id of sample.expectedAdvisory ?? []) expect(result.advisory).toContain(id);
    if (sample.label === 'honest') expect(result.blocking).toEqual([]);
    expect(result.exitCode).toBe(sample.expectedBlocking.length ? 2 : sample.expected.includes('DY001') ? 1 : 0);
  }, 65_000);
});
