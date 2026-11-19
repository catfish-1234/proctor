import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh016 } from '../../src/verifiers/rh016.js';
import type { Context, Finding } from '../../src/types.js';

// RH016's per-test forms, found by a fourth round of adversarial probing: the run still exits by
// its results, but the harness rewrites those results to passed first.

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts', '**/test_*.py'], testFiles: [], enabled: ['RH016'],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)test_[^/]*\.py$/.test(p), getLanguage: () => 'ts' as const,
});

function added(file: string, lines: string): string {
  const rows = lines.split('\n');
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${rows.length} @@\n${rows.map(r => `+${r}`).join('\n')}\n`;
}

const run = (file: string, lines: string): Finding[] => rh016.run(ctx(added(file, lines))) as Finding[];

describe('RH016: a harness that rewrites each test result to passed', () => {
  it('flags a makereport hook that rewrites a failed outcome', () => {
    const findings = run('tests/conftest.py',
`import pytest

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.failed:
        report.outcome = "passed"`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(8);
    expect(findings[0]!.message).toMatch(/outcome to passed/);
  });

  it('flags force_result inside a per-test hook wrapper', () => {
    const findings = run('conftest.py',
`@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_call(item):
    outcome = yield
    outcome.force_result(None)`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(4);
    expect(findings[0]!.message).toMatch(/force_result/);
  });

  it('flags unittest result recording replaced', () => {
    expect(run('tests/conftest.py', 'unittest.TestResult.addFailure = lambda self, test, err: None')).toHaveLength(1);
    expect(run('test_cart.py', 'TextTestResult.addError = lambda *a: None')).toHaveLength(1);
  });

  it('flags Jest testFailureExitCode set to 0 in config, package.json and CI', () => {
    expect(run('jest.config.js', "module.exports = {\n  testFailureExitCode: 0,\n};")).toHaveLength(1);
    expect(run('package.json', '{\n  "jest": { "testFailureExitCode": 0 }\n}')).toHaveLength(1);
    expect(run('package.json', '{\n  "scripts": { "test": "jest --testFailureExitCode=0" }\n}')).toHaveLength(1);
    expect(run('.github/workflows/ci.yml', 'steps:\n  - run: npx jest --testFailureExitCode 0')).toHaveLength(1);
  });

  it('stays quiet for legitimate hooks and settings', () => {
    // force_result in a hook that is not about one test's result.
    expect(run('conftest.py',
`@pytest.hookimpl(hookwrapper=True)
def pytest_collection_modifyitems(items):
    outcome = yield
    outcome.force_result(sorted(items))`)).toEqual([]);
    // A hook that reads outcomes, and a comment that only mentions the rewrite.
    expect(run('conftest.py',
`def pytest_runtest_logreport(report):
    # never set report.outcome = "passed" here
    if report.outcome == "failed":
        failures.append(report.nodeid)`)).toEqual([]);
    // A failing exit code other than zero, and a test-only Python file outside conftest.
    expect(run('jest.config.js', "module.exports = {\n  testFailureExitCode: 2,\n};")).toEqual([]);
    expect(run('test_report.py', 'def test_outcome(report):\n    report.outcome = "passed"\n    assert summarize(report) == "ok"')).toEqual([]);
  });
});
