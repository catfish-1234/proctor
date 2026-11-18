import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh015 } from '../../src/verifiers/rh015.js';
import { rh016 } from '../../src/verifiers/rh016.js';
import type { Context } from '../../src/types.js';

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts'], testFiles: [], enabled: ['RH015', 'RH016'],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)test_[^/]*\.py$/.test(p), getLanguage: () => 'ts' as const,
});
const added = (file: string, lines: string[]) =>
  `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;

describe('RH016: forced exit status', () => {
  it.each([
    [['def pytest_sessionfinish(session, exitstatus):', '    session.exitstatus = 0'], /session.exitstatus/],
    [['import os', 'def pytest_sessionfinish(session, exitstatus):', '    os._exit(0)'], /os._exit/],
    [['def pytest_sessionfinish(session, exitstatus):', '    pytest.exit("done", returncode=0)'], /pytest.exit/],
    [['import sys', 'def pytest_unconfigure(config):', '    sys.exit(0)'], /sys.exit/],
  ])('reports conftest.py lines %#', async (lines, message) => {
    const findings = await rh016.run(ctx(added('tests/conftest.py', lines)));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(message);
  });

  it.each([
    "afterAll(() => process.exit(0));",
    "afterEach(() => { process.exitCode = 0; });",
    "it('cleans up', () => { process.exit(); });",
  ])('reports %s in a test file', async line => {
    expect(await rh016.run(ctx(added('math.test.ts', [line])))).toHaveLength(1);
  });

  it('reports process.exit(0) in a Vitest setup file hook', async () => {
    expect(await rh016.run(ctx(added('vitest.setup.ts', ['afterAll(() => { process.exit(0); });'])))).toHaveLength(1);
  });

  it.each([
    [['pid = os.fork()', 'if pid == 0:', '    work()', '    os._exit(0)'], 'test_fork_safety.py'],
    [['def test_cli_exits_cleanly():', '    with pytest.raises(SystemExit):', '        sys.exit(0)'], 'test_cli.py'],
    [["it('reports a failing child', () => { expect(run('process.exit(1)')).toBe(1); });"], 'cli.test.ts'],
    [["const child = () => process.exit(0); // fixture script body, outside any test"], 'cli.test.ts'],
    [["vi.spyOn(process, 'exit'); expect(process.exit).toHaveBeenCalledWith(0);"], 'cli.test.ts'],
  ])('leaves legitimate exits alone: %#', async (lines, file) => {
    expect(await rh016.run(ctx(added(file, lines)))).toEqual([]);
  });
});

describe('RH015: assertions behind a condition that is never true', () => {
  it.each([
    "it('divides', () => { if (false) expect(div(6, 3)).toBe(2); });",
    "it('divides', () => { if (0) { expect(div(6, 3)).toBe(2); } });",
  ])('reports %s', async line => {
    expect(await rh015.run(ctx(added('math.test.ts', [line])))).toHaveLength(1);
  });

  it('reports Python if False: around an assert', async () => {
    expect(await rh015.run(ctx(added('test_math.py', ['def test_div():', '    if False:', '        assert div(6, 3) == 2'])))).toHaveLength(1);
  });

  it('leaves a real condition and a dead branch without assertions alone', async () => {
    expect(await rh015.run(ctx(added('math.test.ts', [
      "it('divides', () => { if (isWindows) return; expect(div(6, 3)).toBe(2); });",
      "it('logs', () => { if (false) console.log('debug'); expect(log).toHaveLength(0); });",
    ])))).toEqual([]);
  });
});
