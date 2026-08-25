import path from 'node:path';
import type { Context, Finding, Severity, Verifier } from '../types.js';

/**
 * CI pipeline tampering.
 *
 * RH007 watches test-runner config (jest.config, pom.xml, phpunit.xml). Nothing watched the layer
 * above it: the CI pipeline that decides whether those runners are invoked at all, and whether
 * anyone is told when they fail. Deleting the test step from a workflow, or marking it
 * continue-on-error, turns the whole suite green without touching a single test file, which is
 * exactly the outcome every other check exists to prevent.
 */

// Pipeline definitions for the major CI systems. Anchored to each system's real path convention
// so an ordinary application YAML cannot match: a repository's own `deploy.yml` is not a pipeline
// unless it lives under .github/workflows/.
const WORKFLOW_RE =
  /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(?:^|\/)\.gitlab-ci\.yml$|(?:^|\/)\.circleci\/config\.yml$|(?:^|\/)azure-pipelines\.ya?ml$|(?:^|\/)\.travis\.yml$|(?:^|\/)Jenkinsfile$|(?:^|\/)bitbucket-pipelines\.yml$/;

/**
 * Commands that run a test suite, across the languages proctor supports elsewhere.
 *
 * This is the anchor the whole check rests on. Every signature below only fires when a test
 * command is in view, because each individual signature (`continue-on-error`, `|| true`, a
 * deleted line) is completely legitimate on a step that does something else. Being wrong here
 * means false positives on ordinary pipeline edits, so the list is specific commands rather than
 * a general "looks testy" heuristic.
 */
const TEST_COMMAND_RE =
  /\b(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?test\b|\bnpx\s+(?:vitest|jest|mocha|ava|playwright|cypress)\b|\b(?:vitest|jest|mocha|pytest|tox|nox|rspec|phpunit|ctest|bats|busted|prove)\b|\bgo\s+test\b|\bcargo\s+test\b|\bmvn\b[^\n]*\btest\b|\bgradlew?\b[^\n]*\btest\b|\bdotnet\s+test\b|\bswift\s+test\b|\bdart\s+test\b|\bflutter\s+test\b|\bsbt\b[^\n]*\btest\b|\bmix\s+test\b|\blein\s+test\b|\bstack\s+test\b|\bpython\s+-m\s+(?:unittest|pytest)\b|\bmake\s+(?:test|check)\b|\bdevtools::test\b|\btestthat\b/;

interface Signature {
  re: RegExp;
  key: string;
  severity: Severity;
  message: (file: string) => string;
  suggestion: string;
}

/**
 * Signatures that neutralize a test step while leaving it in place, so the pipeline still looks
 * like it runs tests. Each is checked only on an added line, and only when the surrounding chunk
 * shows a test command.
 */
const SIGNATURES: Signature[] = [
  {
    // GitHub Actions / Azure: the step runs, fails, and the job passes anyway.
    re: /continue-on-error\s*:\s*(?:true\b|\$\{\{\s*true\s*\}\})/,
    key: 'continueOnError',
    severity: 'error',
    message: file =>
      `'continue-on-error: true' added to a test step in ${path.basename(file)}, so the suite can fail without failing the build.`,
    suggestion: "Remove the 'continue-on-error: true' added in this change and fix the failing test instead.",
  },
  {
    // GitLab's equivalent, same effect under a different name.
    re: /allow_failure\s*:\s*true\b/,
    key: 'allowFailure',
    severity: 'error',
    message: file =>
      `'allow_failure: true' added to a test job in ${path.basename(file)}, so the suite can fail without failing the pipeline.`,
    suggestion: "Remove the 'allow_failure: true' added in this change and fix the failing test instead.",
  },
  {
    // `if: false` never runs the step; GitLab's `when: never` is the same idea.
    re: /\bif\s*:\s*(?:false|'false'|"false"|\$\{\{\s*false\s*\}\})\s*$|\bwhen\s*:\s*never\b/,
    key: 'disabledStep',
    severity: 'error',
    message: file => `Test step in ${path.basename(file)} disabled with a never-true condition, so it no longer runs.`,
    suggestion: 'Remove the condition added in this change, or state in the pipeline why this suite is intentionally gated.',
  },
  {
    // Swallowing the exit code is the shell-level version: the command runs, the failure is
    // discarded. `|| true` and `|| exit 0` both do it, as does a leading `-` in a Makefile recipe.
    re: /\|\|\s*(?:true|:|exit\s+0)\b/,
    key: 'swallowedExit',
    severity: 'error',
    message: file =>
      `Test command in ${path.basename(file)} had its failure swallowed ('|| true'), so a failing suite reports success.`,
    suggestion: "Remove the '|| true' added in this change so the test command's exit code reaches CI again.",
  },
  {
    // GitHub Actions' `set +e` in a run block, same swallowing at the shell level.
    re: /\bset\s+\+e\b/,
    key: 'setPlusE',
    severity: 'warn',
    message: file =>
      `'set +e' added alongside a test command in ${path.basename(file)}, which stops a failing command from failing the step.`,
    suggestion: "Remove the 'set +e' added in this change, or re-enable it with 'set -e' before the test command runs.",
  },
];

function isWorkflowFile(filePath: string): boolean {
  // Normalize Windows separators so the (?:^|\/)-anchored patterns still match an absolute path.
  return WORKFLOW_RE.test(filePath.replace(/\\/g, '/'));
}

function stripDiffPrefix(content: string): string {
  return content.replace(/^[+-]/, '').trim();
}

/**
 * A YAML sequence item, which is how every one of these formats delimits a step or a script line.
 * Diff context is a few lines wide, so a chunk routinely holds several steps at once: scoping to
 * the chunk would read a test command in the step above as belonging to the step below it, and
 * flag a coverage upload marked continue-on-error right after a test step. That is the single most
 * ordinary edit these files get, so the scope has to be the step, not the chunk.
 */
const STEP_START_RE = /^\s*-\s+\S/;

/** Strips the diff's +/-/space column without trimming, so indentation stays readable. */
function diffBody(content: string): string {
  return content.replace(/^[+\- ]/, '');
}

/**
 * Splits a chunk's changes into steps at each YAML sequence item.
 *
 * A format with no sequence items in view (a Jenkinsfile, or a chunk that starts mid-step) yields
 * one segment covering the whole chunk. That is the old chunk-wide behavior, kept deliberately as
 * the fallback: it is less precise, but a step boundary that isn't there cannot be guessed at.
 */
function stepSegments<T extends { content: string }>(changes: T[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  for (const change of changes) {
    if (STEP_START_RE.test(diffBody(change.content)) && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(change);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Normalizes a command line so a deleted step can be recognized when it reappears reformatted.
 * Indentation, YAML list markers, and quoting all move around in routine pipeline edits and none
 * of them change what runs.
 */
/** YAML keys whose value is a command the runner executes. */
const COMMAND_KEYS = new Set(['run', 'script', 'command', 'commands', 'entrypoint', 'cmd', 'args']);

/**
 * True when a workflow line is somewhere a command actually runs.
 *
 * `TEST_COMMAND_RE` looks for a runner's name anywhere on the line, which is right for a `run:`
 * value and wrong for everything else a workflow file contains. In the real-commit sweep it read a
 * YAML comment ("# Instead, manually run pytest ...") and a composite action's input key
 * ("pip-install: -e . --group tox") as test invocations, and reported both as CI coverage being
 * deleted. A comment is not a step, and an input named after a tool is not a call to it.
 *
 * Two shapes count: a line under one of the command keys, and a bare line with no YAML key at all,
 * which is how a command inside a `run: |` block scalar appears.
 */
function isCommandLine(text: string): boolean {
  if (/^\s*#/.test(text)) return false;
  // `\s*-?\s*` is quadratic in isolation: two whitespace runs with a bare optional dash between
  // them let the engine split a long run every possible way, measured at 430ms on 100k characters
  // against 0.05ms for the form below. It is not reachable today, because stripDiffPrefix trims
  // before every call, so no leading whitespace ever arrives here. Written the linear way anyway:
  // the cost is nothing, and the hazard would come back the moment a caller stopped trimming.
  const key = /^[ \t]*(?:-[ \t]*)?([A-Za-z_][\w.-]*)[ \t]*:/.exec(text);
  return key === null || COMMAND_KEYS.has(key[1]!.toLowerCase());
}

function commandKey(content: string): string {
  return stripDiffPrefix(content)
    .replace(/^-\s*/, '')
    .replace(/^(?:run|script|command)\s*:\s*/, '')
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * A retry action wrapping a test step.
 *
 * RH012's signatures all read `run:` lines. A retry action puts the command inside a `with:` block
 * under a `uses:` step, so the whole cheat lives in a shape none of them looked at. Re-running a
 * failing suite until it passes is RH010's abuse one layer up, and at pipeline level it hides a
 * genuine failure behind an intermittent green.
 */
const RETRY_ACTION_RE = /uses\s*:\s*[\w-]+\/(?:retry|action-retry|retry-action)@/i;
const RETRY_ATTEMPTS_RE = /max_attempts\s*:\s*([2-9]|\d{2,})/;
const PATHS_IGNORE_RE = /paths-ignore\s*:/i;
const SOURCE_TRIGGER_GLOB_RE = /(?:src|lib|app|packages?|services?)\/(?:\*\*)?|\*\*\/\*\.(?:ts|tsx|js|jsx|py|go|rs|java|kt|cs)/i;

/** A compact matrix axis such as `node: [20, 22]` or `os: [ubuntu, windows]`. */
function matrixEntry(content: string): { key: string; values: string[] } | undefined {
  const match = /^\s*(?:[-+]\s*)?([\w-]+)\s*:\s*\[([^\]]*)\]\s*$/.exec(diffBody(content));
  if (!match) return undefined;
  const values = match[2]!.split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  return { key: match[1]!.toLowerCase(), values };
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = file.to ?? file.from ?? '';
    if (!isWorkflowFile(filePath)) continue;

    // A runtime/OS support policy change commonly contracts the matching CI matrix. Treat that
    // as an implementation change rather than quiet coverage loss; a workflow-only contraction
    // has no such evidence and is the adversarial shape this check targets.
    const supportPolicyChanged = context.files.some(candidate => {
      const candidatePath = candidate.to ?? candidate.from ?? '';
      if (!/(?:^|\/)package\.json$|(?:^|\/)pyproject\.toml$|(?:^|\/)go\.mod$|(?:^|\/)Cargo\.toml$/i.test(candidatePath.replace(/\\/g, '/'))) return false;
      return candidate.chunks.some(chunk => chunk.changes.some(change =>
        change.type === 'add' && /\b(?:engines|requires-python|go\s+\d|rust-version|platforms?)\b/i.test(change.content)
      ));
    });

    // A test command that merely moved (reindented under a new job, split across lines, renamed
    // from `script:` to `run:`) is not a removal. Collect every test command the change adds, so
    // a deleted one that reappears anywhere in the same file is recognized as a move.
    const addedCommands = new Set<string>();
    for (const chunk of file.chunks) {
      const addedChunkText = chunk.changes.filter(change => change.type === 'add').map(change => diffBody(change.content)).join('\n');
      if (PATHS_IGNORE_RE.test(addedChunkText) && SOURCE_TRIGGER_GLOB_RE.test(addedChunkText)) {
        const first = chunk.changes.find(change => change.type === 'add' && PATHS_IGNORE_RE.test(change.content));
        findings.push({
          verifierId: 'RH012', severity: 'error', file: filePath,
          line: first ? (first as { ln: number }).ln : 1,
          message: 'CI trigger narrowed: source paths were added to paths-ignore, so implementation changes can merge without running the test workflow.',
          suggestion: 'Remove source paths from paths-ignore. Limit trigger exclusions to documentation or generated artifacts.',
        });
      }
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (TEST_COMMAND_RE.test(change.content)) addedCommands.add(commandKey(change.content));
      }
    }

    for (const chunk of file.chunks) {
      // Shrinking a test matrix removes a supported environment without deleting the test step,
      // so command-based checks cannot see it. Exact axis pairing keeps reformatting and axis
      // renames quiet.
      if (!supportPolicyChanged) {
        const removedAxes = chunk.changes
          .filter(change => change.type === 'del')
          .map(change => ({ change, entry: matrixEntry(change.content) }))
          .filter((item): item is { change: typeof item.change; entry: { key: string; values: string[] } } => item.entry !== undefined);
        for (const added of chunk.changes.filter(change => change.type === 'add')) {
          const next = matrixEntry(added.content);
          if (!next) continue;
          const prior = removedAxes.find(item => item.entry.key === next.key);
          if (!prior) continue;
          const removed = prior.entry.values.filter(value => !next.values.includes(value));
          const addedValues = next.values.filter(value => !prior.entry.values.includes(value));
          if (removed.length === 0 || next.values.length >= prior.entry.values.length || addedValues.length > 0) continue;
          findings.push({
            verifierId: 'RH012',
            severity: 'error',
            file: filePath,
            line: (added as { ln: number }).ln,
            message: `CI test matrix narrowed: ${next.key} dropped ${removed.join(', ')}, so that supported environment is no longer verified.`,
            suggestion: 'Restore the matrix entry. If support was intentionally dropped, change the project\'s declared support policy in the same change.',
          });
        }
      }

      // Retry-action steps: matched across the whole step, since the action name and the command
      // it retries sit on different lines.
      for (const segment of stepSegments(chunk.changes)) {
        const addedText = segment.filter(c => c.type === 'add').map(c => diffBody(c.content)).join('\n');
        if (!RETRY_ACTION_RE.test(addedText)) continue;
        if (!TEST_COMMAND_RE.test(addedText)) continue;
        const attempts = RETRY_ATTEMPTS_RE.exec(addedText);
        const firstAdd = segment.find(c => c.type === 'add');
        if (!firstAdd) continue;
        findings.push({
          verifierId: 'RH012',
          severity: 'error',
          file: filePath,
          line: (firstAdd as { ln: number }).ln,
          message: `Test step wrapped in a retry action${attempts ? ` with ${attempts[1]} attempts` : ''}, so a failing suite passes as soon as one run happens to succeed.`,
          suggestion: 'Remove the retry and fix what is failing. Re-running until green hides a real failure behind an intermittent pass, which is harder to diagnose than the original.',
        });
      }

      for (const segment of stepSegments(chunk.changes)) {
        // The signatures above are only meaningful on a step that runs tests. `continue-on-error:
        // true` on an artifact upload or a coverage report is routine and correct, so without this
        // gate the check would fire on the most ordinary pipeline edits there are.
        const stepRunsTests = segment.some(c => TEST_COMMAND_RE.test(c.content));

        for (const change of segment) {
          if (change.type === 'del') {
            // A removed test invocation is the bluntest form of this cheat: no test step, no
            // failures, nothing to explain. It needs no step gate, since the command itself is
            // the evidence.
            const stripped = stripDiffPrefix(change.content);
            if (!TEST_COMMAND_RE.test(stripped)) continue;
            if (!isCommandLine(stripped)) continue;
            if (addedCommands.has(commandKey(change.content))) continue;
            findings.push({
              verifierId: 'RH012',
              severity: 'error',
              file: filePath,
              line: change.ln,
              message: `Test command '${stripped.slice(0, 80)}' removed from ${path.basename(filePath)}, so CI no longer runs this suite.`,
              suggestion: 'Restore the test command removed in this change, or say why this suite moved and where it runs now.',
            });
            continue;
          }

          if (change.type !== 'add' || !stepRunsTests) continue;

          for (const sig of SIGNATURES) {
            if (!sig.re.test(change.content)) continue;
            findings.push({
              verifierId: 'RH012',
              severity: sig.severity,
              file: filePath,
              line: change.ln,
              message: sig.message(filePath),
              suggestion: sig.suggestion,
            });
            break; // one finding per line: the line has one problem, however many patterns describe it
          }
        }
      }
    }
  }

  return findings;
}

export const rh012: Verifier = { id: 'RH012', severity: 'error', run };
