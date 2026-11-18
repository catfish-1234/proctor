import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests, VITEST5_REPORT, type Adapter } from '../src/dynamic/adapters.js';

// Vitest 5 writes its JSON reporter to .vitest/json/output.json and prints only that path, where
// Vitest 4 printed the report on stdout. A stand-in runner reproduces each behavior exactly.
const REPORT = JSON.stringify({
  success: false, numTotalTests: 2, numPassedTests: 1, numFailedTests: 1, numPendingTests: 0,
  testResults: [{ assertionResults: [
    { fullName: 'cart sums line items', status: 'passed' },
    { fullName: 'cart applies a discount', status: 'failed' },
  ] }],
});

function fakeVitest(script: string): Adapter {
  return { command: process.execPath, args: ['-e', script], kind: 'vitest' };
}

describe('dynamic Vitest reports', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'proctor-vitest5-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads the Vitest 5 report file when stdout carries only its path', () => {
    const run = runTests(fakeVitest(`
      const fs = require('fs');
      fs.mkdirSync('.vitest/json', { recursive: true });
      fs.writeFileSync(${JSON.stringify(VITEST5_REPORT)}, ${JSON.stringify(REPORT)});
      console.log('JSON report written to ' + process.cwd() + '/.vitest/json/output.json');
      process.exit(1);`), dir, 'new tests / new code');
    expect(run.passed).toEqual(['cart sums line items']);
    expect(run.failed).toEqual(['cart applies a discount']);
  });

  it('still reads a Vitest 4 report from stdout', () => {
    const run = runTests(fakeVitest(`console.log(${JSON.stringify(REPORT)}); process.exit(1);`), dir, 'run');
    expect(run.failed).toEqual(['cart applies a discount']);
  });

  it('never reads a report left behind by an earlier run', () => {
    mkdirSync(join(dir, '.vitest', 'json'), { recursive: true });
    writeFileSync(join(dir, VITEST5_REPORT), REPORT);
    expect(() => runTests(fakeVitest(`console.log('no report'); process.exit(0);`), dir, 'run'))
      .toThrow(/did not produce readable JSON/);
  });

  it.skipIf(process.platform === 'win32')('refuses a report that is a symlink', () => {
    writeFileSync(join(dir, 'elsewhere.json'), REPORT);
    expect(() => runTests(fakeVitest(`
      const fs = require('fs');
      fs.mkdirSync('.vitest/json', { recursive: true });
      fs.symlinkSync(require('path').resolve('elsewhere.json'), ${JSON.stringify(VITEST5_REPORT)});
      process.exit(1);`), dir, 'run')).toThrow(/unreadable Vitest JSON report/);
  });
});
