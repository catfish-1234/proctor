import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResults, runTests } from '../src/dynamic/adapters.js';

// Authored development regressions, not an independent detection benchmark.
describe('dynamic reporter evidence integrity', () => {
  it.each([
    ['tap', 'ok 1 - same\nnot ok 2 - same\n', '', ''],
    ['unittest', '', 'case (suite.case) ... ok\ncase (suite.case) ... FAIL\n', ''],
    ['pytest', '', '', '<testsuite><testcase name="same"/><testcase name="same"><failure/></testcase></testsuite>'],
    ['vitest', JSON.stringify({ testResults: [{ assertionResults: [{ fullName: 'same', status: 'passed' }, { fullName: 'same', status: 'failed' }] }] }), '', ''],
  ] as const)('rejects ambiguous %s names rather than silently dropping them', (kind, stdout, stderr, xml) => {
    expect(() => parseResults(kind, stdout, stderr, xml)).toThrow('duplicate or conflicting');
  });

  it.each(['jest', 'vitest'] as const)('validates %s summaries and refuses multiple streams', kind => {
    const good = { numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, testResults: [{ assertionResults: [{ fullName: 'works', status: 'passed' }] }] };
    expect(parseResults(kind, JSON.stringify(good), '')).toEqual({ passed: ['works'], failed: [] });
    expect(() => parseResults(kind, JSON.stringify({ ...good, numTotalTests: 2 }), '')).toThrow('disagrees');
    expect(() => parseResults(kind, JSON.stringify(good), JSON.stringify(good))).toThrow('multiple structured');
    expect(() => parseResults(kind, JSON.stringify({ testResults: [{}] }), '')).toThrow('missing assertion');
    expect(() => parseResults(kind, JSON.stringify({ testResults: [{ assertionResults: [{ status: 'passed' }] }] }), '')).toThrow('unnamed');
  });

  it('refuses TAP bailout and incomplete plans but keeps honest nested reports', () => {
    expect(() => parseResults('tap', 'ok 1 - one\n1..2\n', '')).toThrow('plan disagrees');
    expect(() => parseResults('tap', 'ok 1 - one\nBail out! crash\n', '')).toThrow('bailed out');
    expect(parseResults('tap', '    ok 1 - child\n    1..1\nok 1 - parent\n1..1\n', '')).toEqual({ passed: ['child', 'parent'], failed: [] });
  });

  it('refuses truncated/unsupported JUnit instead of calling the partial document complete', () => {
    expect(() => parseResults('pytest', '', '', '<testsuite><testcase name="a">')).toThrow('JUnit');
    expect(() => parseResults('pytest', '', '', '<testsuite><testcase name="a"></testsuite>')).toThrow('truncated');
    expect(() => parseResults('pytest', '', '', '<!DOCTYPE x><testsuite/>')).toThrow('JUnit');
    expect(() => parseResults('pytest', '', '', '<testsuite tests="2"><testcase name="one"/></testsuite>')).toThrow('JUnit tests disagrees');
  });

  it('does not accept pre-existing JUnit or command/reporter disagreement', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-reporter-'));
    try {
      writeFileSync(join(dir, '.proctor-junit.xml'), '<testsuite><testcase name="stale"/></testsuite>');
      expect(() => runTests({ command: process.execPath, args: ['-e', ''], kind: 'pytest' }, dir, 'control')).toThrow('inconclusive');
      expect(() => runTests({ command: process.execPath, args: ['-e', 'console.log("not ok 1 - failed");'], kind: 'tap' }, dir, 'control')).toThrow('disagree');
      expect(() => runTests({ command: process.execPath, args: ['-e', 'console.log("ok 1 - passed");process.exit(1);'], kind: 'tap' }, dir, 'control')).toThrow('without a named failing');
      expect(() => runTests({ command: process.execPath, args: ['-e', ''], kind: 'tap' }, dir, 'control')).toThrow('no named');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not pretend a coherent forged report proves actual execution', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-coherent-report-'));
    try {
      const r = runTests({ command: process.execPath, args: ['-e', 'console.log("ok 1 - invented\\n1..1");'], kind: 'tap' }, dir, 'output only');
      expect(r.passed).toEqual(['invented']); // Known limit, not an authentication claim.
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
