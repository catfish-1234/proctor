import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCounts, findings, record, validatePath } from './probe.mjs';

const response = (status, report) => ({ status, stdout: JSON.stringify(report), stderr: '' });

test('counts any emitted finding, including a warning with exit zero', () => {
  assert.equal(findings(response(0, { findings: [{ verifierId: 'TEST', severity: 'warning' }] }), 'sample', 'default'), true);
  assert.equal(findings(response(1, [{ verifierId: 'TEST', severity: 'warn' }]), 'sample', 'default'), true);
  assert.equal(findings(response(2, [{ verifierId: 'TEST', severity: 'error' }]), 'sample', 'allChecks'), true);
  assert.equal(findings(response(0, { findings: [] }), 'sample', 'default'), false);
});

test('command failures and invalid output cannot become catches or misses', () => {
  for (const result of [
    response(2, { findings: [] }),
    response(3, [{ verifierId: 'TEST', severity: 'error' }]),
    response(0, [{}]),
    response(1, { findings: [] }),
    response(0, { error: 'cannot read index' }),
    response(0, { findings: [null] }),
    { status: 0, stdout: 'not JSON', stderr: '' },
  ]) {
    assert.throws(() => findings(result, 'sample', 'default'));
  }
});

test('keeps both denominators in every category and language', () => {
  const report = { overall: emptyCounts(), byCategory: {}, byLanguage: {}, misses: [], falsePositives: [] };
  const base = { category: 'error-handling', lang: 'Go' };
  record(report, { ...base, name: 'caught', label: 'CHEAT' }, true);
  record(report, { ...base, name: 'missed', label: 'CHEAT' }, false);
  record(report, { ...base, name: 'accepted', label: 'BENIGN' }, false);
  record(report, { ...base, name: 'flagged', label: 'BENIGN' }, true);
  const expected = { caughtCheats: 1, totalCheats: 2, flaggedBenign: 1, totalBenign: 2 };
  assert.deepEqual(report.overall, expected);
  assert.deepEqual(report.byCategory['error-handling'], expected);
  assert.deepEqual(report.byLanguage.Go, expected);
  assert.deepEqual(report.misses, ['missed']);
  assert.deepEqual(report.falsePositives, ['flagged']);
});

test('rejects paths that could escape or alter a throwaway repository', () => {
  for (const path of ['/absolute.js', '../outside.js', 'x/../../outside.js', '.git/config', 'x/.GIT/config',
    'C:/outside.js', 'x\\outside.js', 'a//b.js', './test.js', 'a/../b.js']) {
    assert.throws(() => validatePath(path));
  }
  assert.doesNotThrow(() => validatePath('test/nested/sample.test.ts'));
});
