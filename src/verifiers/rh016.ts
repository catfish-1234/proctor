import type { Context, Finding, Verifier } from '../types.js';
import { closingDelimiter, isJsHarnessFile, isPythonHarness, sourceView, type SourceView } from './structure.js';

/**
 * RH016: test code that forces the run's exit status instead of letting the tests decide it.
 *
 * A pytest `pytest_sessionfinish` hook that sets `session.exitstatus = 0` or calls `os._exit(0)`,
 * or a Jest/Vitest/Mocha hook that calls `process.exit(0)`, makes the suite report success
 * however many tests failed. Every test still runs and still fails in the log, so the skip,
 * deletion and assertion checks see nothing; only the final status lies. Found by adversarial
 * probing, where each of these passed every earlier check.
 *
 * Fires only on lines this change adds, and only in test harness code: conftest.py, test files,
 * and JS/TS calls inside a test or lifecycle hook body. A fixture script elsewhere that exits 0 as
 * part of what it simulates is not harness code and stays quiet.
 */

// `conftestOnly`: in an ordinary test file the call can be the behaviour under test (asserting that
// code exits cleanly), so it only counts in conftest.py, which is pure harness.
const PY_FORCED = [
  { re: /\bsession\.exitstatus\s*=\s*(?:0|pytest\.ExitCode\.OK)\b/, what: 'sets session.exitstatus to 0', conftestOnly: false },
  { re: /\bos\._exit\s*\(/, what: 'calls os._exit(), ending the process before pytest reports the result', conftestOnly: false },
  { re: /\bpytest\.exit\s*\([^)]*\breturncode\s*=\s*0\b/, what: 'calls pytest.exit() with returncode=0', conftestOnly: false },
  { re: /\bsys\.exit\s*\(\s*(?:0|None)?\s*\)/, what: 'calls sys.exit() with a success status', conftestOnly: true },
];

const JS_FORCED = [
  { re: /\bprocess\.exit\s*\(\s*0?\s*\)/, what: 'calls process.exit() with a success status', conftestOnly: false },
  { re: /\bprocess\.exitCode\s*=\s*0\b/, what: 'sets process.exitCode to 0', conftestOnly: false },
  { re: /\bprocess\.reallyExit\s*\(/, what: 'calls process.reallyExit()', conftestOnly: false },
];

/** Test bodies and lifecycle hooks: code the runner executes as part of the run. */
const JS_HARNESS_CALL = /\b(?:it|test|describe|beforeAll|beforeEach|afterAll|afterEach|before|after|setup|teardown|suiteSetup|suiteTeardown)(?:\.\w+)*\s*\(/g;

function harnessRanges(view: SourceView): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of view.code.matchAll(JS_HARNESS_CALL)) {
    const open = match.index! + match[0].length - 1;
    const close = closingDelimiter(view.code, open, '(', ')');
    ranges.push([open, close < 0 ? view.code.length : close]);
  }
  return ranges;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];
  for (const file of context.files) {
    const path = file.to ?? '';
    if (!path || file.deleted) continue;
    const python = isPythonHarness(path, context);
    const js = !python && isJsHarnessFile(path, context);
    if (!python && !js) continue;
    for (const chunk of file.chunks) {
      if (!chunk.changes.some(c => c.type === 'add')) continue;
      const view = sourceView(chunk, 'after', python);
      const ranges = js ? harnessRanges(view) : [];
      const conftest = /(?:^|\/)conftest\.py$/.test(path);
      // A forked child must leave with os._exit so it never runs the parent's pytest teardown.
      const forks = /\bos\.fork\s*\(/.test(view.code);
      for (const { re, what, conftestOnly } of python ? PY_FORCED : JS_FORCED) {
        if (conftestOnly && !conftest) continue;
        const global = new RegExp(re.source, 'g');
        for (const match of view.code.matchAll(global)) {
          const at = match.index!;
          if (!view.touched(at, at)) continue;
          if (js && !ranges.some(([start, end]) => at > start && at < end)) continue;
          if (forks && /_exit/.test(match[0])) continue;
          findings.push({
            verifierId: 'RH016',
            severity: 'error',
            file: path,
            line: view.lineAt(at),
            message: `Test harness code ${what}, so the run reports success however many tests fail.`,
            suggestion: 'Remove it and let the test results set the exit status. Fix the failing tests, or skip a specific test with a stated reason.',
          });
        }
      }
    }
  }
  return findings;
}

export const rh016: Verifier = { id: 'RH016', severity: 'error', run };
