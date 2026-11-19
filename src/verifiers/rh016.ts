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
const PY_FORCED: Array<{ re: RegExp; what: string; conftestOnly: boolean; raw?: boolean }> = [
  { re: /\bsession\.exitstatus\s*=\s*(?:0|pytest\.ExitCode\.OK)\b/, what: 'sets session.exitstatus to 0', conftestOnly: false },
  { re: /\bos\._exit\s*\(/, what: 'calls os._exit(), ending the process before pytest reports the result', conftestOnly: false },
  { re: /\bpytest\.exit\s*\([^)]*\breturncode\s*=\s*0\b/, what: 'calls pytest.exit() with returncode=0', conftestOnly: false },
  { re: /\bsys\.exit\s*\(\s*(?:0|None)?\s*\)/, what: 'calls sys.exit() with a success status', conftestOnly: true },
  // Per-test forms, found by adversarial probing: the run still exits by its results, but the
  // results themselves now say passed.
  // Matched on the raw text, since the value is a string; the match must still start in code.
  { re: /\.outcome\s*=\s*['"](?:passed|skipped)['"]/, what: "rewrites a test report's outcome to passed", conftestOnly: true, raw: true },
  { re: /\b(?:unittest\s*\.\s*)?(?:Text)?TestResult\s*\.\s*add(?:Failure|Error|UnexpectedSuccess)\s*=(?!=)/, what: 'replaces how unittest records a failure', conftestOnly: false },
];

/** pytest hooks that run or report a single test: a result forced there is that test's verdict. */
const PY_TEST_HOOK = /^(\s*)(?:async\s+)?def\s+pytest_runtest_(?:call|makereport|protocol|logreport)\s*\(/;

/** `outcome.force_result(...)` inside a per-test pytest hook wrapper, which replaces the test's own result. */
function pyForcedHookResult(view: SourceView): number[] {
  const offsets: number[] = [];
  const lines = view.code.split('\n');
  let offset = 0;
  let hookIndent = -1;
  for (const line of lines) {
    const hook = PY_TEST_HOOK.exec(line);
    if (hook) hookIndent = hook[1]!.length;
    else if (hookIndent >= 0 && line.trim() !== '' && /^\s*/.exec(line)![0].length <= hookIndent) hookIndent = -1;
    const forced = /\.\s*force_result\s*\(/.exec(line);
    if (hookIndent >= 0 && !hook && forced) offsets.push(offset + forced.index);
    offset += line.length + 1;
  }
  return offsets;
}

/** Jest's exit code for a failing run, set to success in config or on the command line. */
const JEST_FAILURE_EXIT_ZERO = /\btestFailureExitCode["']?\s*[:=]\s*["']?0\b|--testFailureExitCode(?:=|\s+)0\b/;
const JEST_CONFIG_FILE = /(?:^|\/)(?:jest\.config\.[cm]?[jt]s(?:on)?|package\.json)$|\.ya?ml$/;

const JS_FORCED: Array<{ re: RegExp; what: string; conftestOnly: boolean; raw?: boolean }> = [
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
    if (JEST_CONFIG_FILE.test(path)) {
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add' || !JEST_FAILURE_EXIT_ZERO.test(change.content)) continue;
          findings.push({
            verifierId: 'RH016', severity: 'error', file: path, line: (change as { ln: number }).ln,
            message: 'Jest testFailureExitCode is set to 0, so a run with failing tests exits as a success.',
            suggestion: 'Remove the override and let failing tests fail the run. Fix the failing tests, or skip a specific test with a stated reason.',
          });
        }
      }
      continue;
    }
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
      if (python) {
        for (const at of pyForcedHookResult(view)) {
          if (!view.touched(at, at)) continue;
          findings.push({
            verifierId: 'RH016', severity: 'error', file: path, line: view.lineAt(at),
            message: 'A per-test pytest hook replaces the test\'s result with force_result(), so a failing test reports whatever the hook forces.',
            suggestion: 'Remove the override and let the test results stand. Fix the failing tests, or skip a specific test with a stated reason.',
          });
        }
      }
      for (const { re, what, conftestOnly, raw } of python ? PY_FORCED : JS_FORCED) {
        if (conftestOnly && !conftest) continue;
        const global = new RegExp(re.source, 'g');
        for (const match of (raw ? view.text : view.code).matchAll(global)) {
          const at = match.index!;
          if (raw && view.code[at] !== view.text[at]) continue; // inside a comment or string
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
