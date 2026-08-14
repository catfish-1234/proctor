import { describe, expect, it } from 'vitest';
import parseDiff from 'parse-diff';
import { wi113 } from '../../src/verifiers/wi113.js';
import type { Context } from '../../src/types.js';

function diffOf(path: string, before: string, after: string) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  return parseDiff([
    `diff --git a/${path} b/${path}`,
    '--- a/' + path,
    '+++ b/' + path,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map(line => '-' + line),
    ...newLines.map(line => '+' + line),
  ].join('\n'));
}

const context = (files: ReturnType<typeof parseDiff>): Context => ({
  cwd: '', files, testPathGlobs: ['**/*.test.*'], testFiles: [], enabled: ['WI113'],
  isTestFile: path => path.includes('.test.'), getLanguage: () => 'ts',
});

describe('WI113, failure-avoidance workarounds', () => {
  it('flags a benchmark workload reduction', () => {
    const files = diffOf('bench/perf.ts', 'const ITERATIONS = 10000;', 'const ITERATIONS = 1;');
    expect(wi113.run(context(files))).toHaveLength(1);
  });

  it('flags a concrete dependency downgrade', () => {
    const files = diffOf('package.json', '{ "dependencies": { "lib": "3.4.2" } }', '{ "dependencies": { "lib": "3.3.9" } }');
    expect(wi113.run(context(files))).toHaveLength(1);
  });

  it('allows a dependency upgrade', () => {
    const files = diffOf('package.json', '{ "dependencies": { "lib": "3.3.9" } }', '{ "dependencies": { "lib": "3.4.2" } }');
    expect(wi113.run(context(files))).toEqual([]);
  });

  it('compares dependency range floors', () => {
    const down = diffOf('package.json', '{ "dependencies": { "lib": ">=3.4.2" } }', '{ "dependencies": { "lib": ">=3.3.0" } }');
    const up = diffOf('package.json', '{ "dependencies": { "lib": ">=3.3.0" } }', '{ "dependencies": { "lib": ">=3.4.2" } }');
    expect(wi113.run(context(down))).toHaveLength(1);
    expect(wi113.run(context(up))).toEqual([]);
  });

  it('flags an unexplained fixed delay in shipped code', () => {
    const files = diffOf('src/svc.ts', 'await start();', 'await start();\nawait sleep(5000);');
    expect(wi113.run(context(files))).toHaveLength(1);
  });

  it('allows a protocol delay with an explanation', () => {
    const files = diffOf('src/svc.ts', 'await start();', 'await start();\nawait sleep(5000); // required Retry-After backoff from upstream');
    expect(wi113.run(context(files))).toEqual([]);
  });

  it('does not apply shipped-code delay checks to tests', () => {
    const files = diffOf('src/svc.test.ts', 'await start();', 'await start();\nawait sleep(5000);');
    expect(wi113.run(context(files))).toEqual([]);
  });

  it('does not treat a fixed delay inside a red-team payload literal as shipped code', () => {
    const payload = "C('time', { 'svc.js': `await new Promise(r => setTimeout(r, 5000));` });";
    const files = diffOf('bench/redteam/probe.mjs', '', payload);
    expect(wi113.run(context(files))).toEqual([]);
  });
});
