import path from 'node:path';
import type { Context, Finding, Severity, Verifier } from '../types.js';
import { afterLines, codeLines, deletedLines, isCommentLine, isWatchedSource, pathOf, withoutTrailingComment } from './wi-common.js';

/**
 * The command that runs the checks, neutered.
 *
 * RH012 watches CI pipeline definitions. RH007 watches test-runner config. Between them sits the
 * layer both assume is honest: the `test`, `lint` and `build` scripts that the pipeline invokes and
 * that a developer runs locally. Rewriting `"test": "vitest run"` to `"test": "echo no tests"`
 * turns every one of those green at once, in a file nobody thinks of as a test file, and neither
 * existing check looks there.
 *
 * Found by adversarial probing rather than by reasoning: four separate variants of this got through
 * a corpus of twenty cheats, and it was the single largest cluster of misses.
 */

/** Task-runner files whose entries are the commands everything else depends on. */
const TASK_FILE_RE =
  /(?:^|\/)package\.json$|(?:^|\/)Makefile$|(?:^|\/)Taskfile\.ya?ml$|(?:^|\/)justfile$|(?:^|\/)pyproject\.toml$|(?:^|\/)Rakefile$|(?:^|\/)composer\.json$/i;

/** Script names whose whole purpose is to fail when something is wrong. */
const VERIFICATION_SCRIPT_RE = /"(test|tests|check|lint|typecheck|type-check|tsc|verify|validate|ci|coverage|audit)[\w:-]*"\s*:/i;

/** Commands that actually run a verification tool. */
const REAL_VERIFIER_RE =
  /\b(?:vitest|jest|mocha|ava|pytest|tox|nox|rspec|phpunit|cargo\s+test|go\s+test|dotnet\s+test|mvn|gradle|swift\s+test|mix\s+test|bats|busted|prove|tsc|eslint|ruff|flake8|mypy|pylint|clippy|rubocop|phpstan|stylelint|biome)\b|\bnpm\s+(?:run\s+)?(?:test|\w+)|\bpytest\b/;

/** Replacements that make a verification script succeed without verifying anything. */
const NO_OP_COMMAND_RE =
  /^\s*(?:echo\b|true\b|:\s*$|exit\s+0\b|#|node\s+-e\s+["']["']|cd\s+\.)/;

interface Signature {
  re: RegExp;
  key: string;
  severity: Severity;
  what: string;
  suggestion: string;
}

/** Flags and shapes that let a verification command fail without the script failing. */
const NEUTERING_SIGNATURES: Signature[] = [
  {
    re: /--passWithNoTests\b/,
    key: 'passWithNoTests',
    severity: 'error',
    what: "'--passWithNoTests' added, so a suite with no tests left in it reports success",
    suggestion: 'Remove the flag and put the tests back. An empty suite passing is the outcome this flag exists to produce.',
  },
  {
    re: /;\s*(?:true|exit\s+0)\b/,
    key: 'successfulTail',
    severity: 'error',
    what: 'a successful command appended after verification, replacing the suite status with exit zero',
    suggestion: 'Remove the successful tail and let the verification command determine the script status.',
  },
  {
    re: /\|\|\s*(?:true|:|exit\s+0)\b/,
    key: 'swallowedExit',
    severity: 'error',
    what: "a failure swallowed with '|| true', so the command's exit code stops mattering",
    suggestion: "Remove the '|| true' so the failure reaches whoever runs this.",
  },
  {
    // The right-hand command succeeds, so `test || echo failed` reports success unless it
    // explicitly rethrows/exits non-zero afterwards.
    re: /\|\|\s*(?:echo|printf)\b(?![^\n]*(?:exit|return)\s+[1-9])/,
    key: 'echoSwallowedExit',
    severity: 'error',
    what: 'a verification failure converted into a successful diagnostic command, so the script exits zero',
    suggestion: 'Report the failure if useful, then preserve its non-zero status instead of ending with echo/printf.',
  },
  {
    re: /--(?:no-fail|ignore-failures|exit-zero|force)\b/,
    key: 'forceFlag',
    severity: 'error',
    what: 'a flag that makes the tool exit zero regardless of what it found',
    suggestion: 'Remove the flag and fix what the tool reported.',
  },
  {
    re: /\bprocess\.exit\(\s*0\s*\)/,
    key: 'forcedExitZero',
    severity: 'error',
    what: 'a forced exit 0, so the real exit code is discarded',
    suggestion: 'Propagate the real exit code instead of forcing success.',
  },
];

/** A Makefile recipe prefixed with `-`, which tells make to ignore the command's failure. */
const MAKE_IGNORE_ERROR_RE = /^\s*-\s*\S/;

/** A selector newly narrowing a general test command to a subset or one named file. */
const FOCUSED_SELECTION_RE =
  /(?:^|\s)(?:-k|-t|--grep|--fgrep|--filter|--testNamePattern|--testPathPattern)\s+\S+|(?:^|\s)(?!--)[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?\b/;

/** A verification pipeline whose exit status is the last consumer's unless pipefail is enabled. */
const STATUS_LOSING_PIPELINE_RE =
  /\b(?:vitest|jest|mocha|ava|pytest|tox|nox|rspec|phpunit|cargo\s+test|go\s+test|dotnet\s+test|npm\s+(?:run\s+)?test)\b[^\n]*\|\s*(?:tee|grep|head|tail)\b/;
const BACKGROUNDED_VERIFIER_RE =
  /\b(?:vitest|jest|mocha|ava|pytest|tox|nox|rspec|phpunit|cargo\s+test|go\s+test|dotnet\s+test|npm\s+(?:run\s+)?test)\b[^\n]*\s&\s*$/;
const SNAPSHOT_UPDATE_RE = /(?:^|\s)(?:-u|--update|--updateSnapshot)\b/;

function verifierTool(text: string): string | undefined {
  return /\b(vitest|jest|mocha|ava|pytest|tox|nox|rspec|phpunit|cargo\s+test|go\s+test|dotnet\s+test)\b/.exec(text)?.[1]
    ?? (/\bnpm\s+(?:run\s+)?test\b/.test(text) ? 'npm test' : undefined);
}

/**
 * An exit that forwarded a real status, and the literal-zero exit that replaces it.
 *
 * The `forcedExitZero` signature above only looks inside task-runner files and shell scripts,
 * because a bare `process.exit(0)` in an ordinary `.js` is not a cheat: plenty of programs
 * legitimately finish by exiting zero, and firing on all of them would be the expensive kind of
 * false positive. Adversarial probing found the shape that is unambiguous without needing to know
 * what the file is: a runner that *was* forwarding a child's status and now hardcodes success.
 * `process.exit(code)` becoming `process.exit(0)` discards the only thing the script existed to
 * report, and no refactor produces that pair by accident.
 */
const PROPAGATED_EXIT_RE =
  /\b(?:process\.exit|sys\.exit|os\.exit|os\._exit)\s*\(\s*([^)]+?)\s*\)|^\s*exit\s+(\$\{?\w+\}?)\s*(?:#.*)?$/;
const FORCED_EXIT_ZERO_RE =
  /\b(?:process\.exit|sys\.exit|os\.exit|os\._exit)\s*\(\s*0\s*\)|^\s*exit\s+0\s*(?:#.*)?$/;
const PROPAGATED_EXIT_CODE_RE = /\bprocess\.exitCode\s*=\s*([^;]+?)\s*;?\s*$/;
const FORCED_EXIT_CODE_ZERO_RE = /\bprocess\.exitCode\s*=\s*0\s*;?\s*$/;

/** The status a line exits with, or undefined when the line is not an exit at all. */
function exitStatus(text: string): string | undefined {
  const stripped = withoutTrailingComment(text);
  const assigned = PROPAGATED_EXIT_CODE_RE.exec(stripped);
  if (assigned) return assigned[1]?.trim();
  const m = PROPAGATED_EXIT_RE.exec(stripped);
  if (!m) return undefined;
  return (m[1] ?? m[2])?.trim();
}

function laundersStatus(text: string, status: string): boolean {
  const compact = withoutTrailingComment(text).replace(/\s+/g, '');
  const value = status.replace(/\s+/g, '');
  return compact.includes(`process.exit(${value}?0:${value})`)
    || compact.includes(`process.exitCode=Math.min(${value},0)`);
}

/** Extracts the command half of a `"name": "command"` script entry. */
function scriptCommand(text: string): string | undefined {
  const m = /"[\w:-]+"\s*:\s*"([^"]*)"/.exec(text);
  return m?.[1];
}

function scriptName(text: string): string | undefined {
  return /"([\w:-]+)"\s*:/.exec(text)?.[1];
}

function scriptEntries(text: string): Array<{ name: string; command: string }> {
  return [...text.matchAll(/"([\w:-]+)"\s*:\s*"([^"]*)"/g)]
    .map(match => ({ name: match[1]!, command: match[2]! }));
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath) continue;
    const normalized = filePath.replace(/\\/g, '/');

    // A forwarded exit status replaced by a hardcoded zero. Deliberately outside the task-file
    // gate below: the pairing is what makes this safe to fire on any file, so the check does not
    // need to recognise the file as a runner to know the script stopped reporting.
    if (isWatchedSource(context, filePath)) {
      for (const chunk of file.chunks) {
        const laundered = deletedLines(chunk).find(d => {
          if (isCommentLine(d.text)) return false;
          const status = exitStatus(d.text);
          return status !== undefined && status !== '0' && status !== '';
        });
        if (!laundered) continue;
        const forced = codeLines(chunk).find(a => {
          const text = withoutTrailingComment(a.text);
          return FORCED_EXIT_ZERO_RE.test(text) || FORCED_EXIT_CODE_ZERO_RE.test(text) || laundersStatus(text, exitStatus(laundered.text)!);
        });
        if (!forced) continue;
        findings.push({
          verifierId: 'WI110',
          severity: 'error',
          file: filePath,
          line: forced.line,
          message: `Verification neutered: an exit status that was forwarded ('${exitStatus(laundered.text)!.slice(0, 30)}') is now a hardcoded 0, so a failure exits successfully.`,
          suggestion:
            'Forward the real status again. Everything downstream, from a shell prompt to a CI job, reads only the exit code, so hardcoding zero reports success for a run that failed.',
        });
      }
    }

    const isTaskFile = TASK_FILE_RE.test(normalized);
    const isMakefile = /(?:^|\/)Makefile$/.test(normalized);
    // A shell script that runs the suite is the same layer under a different name.
    const isShellScript = /\.(?:sh|bash)$/.test(normalized);
    if (!isTaskFile && !isShellScript) continue;

    for (const chunk of file.chunks) {
      const added = codeLines(chunk);
      const deleted = deletedLines(chunk);

      // Removing pipefail while retaining a test | tee/grep pipeline changes the reported status
      // from the test's to the final consumer's (normally zero). The command itself is context in
      // this diff, which is why this must inspect the after-state rather than additions alone.
      const removedPipefail = deleted.some(line => /\bset\s+(?:-o\s+pipefail|-euo\s+pipefail)\b/.test(line.text));
      const survivingPipeline = afterLines(chunk).find(line => STATUS_LOSING_PIPELINE_RE.test(line.text));
      if (removedPipefail && survivingPipeline) {
        findings.push({
          verifierId: 'WI110',
          severity: 'error',
          file: filePath,
          line: survivingPipeline.line,
          message: 'Verification neutered: pipefail was removed while a test command still feeds a pipeline, so the final consumer can replace the test failure with exit 0.',
          suggestion: 'Restore pipefail, or capture and propagate the test command\'s status explicitly.',
        });
      }

      const after = afterLines(chunk);
      const afterRunsVerification = after.some(line => REAL_VERIFIER_RE.test(line.text));
      const failFastShell = after.some(line => /\bset\s+-[a-z]*e\b/.test(line.text));
      const backgroundStatusPropagated = after.some(line => /^\s*wait\b/.test(line.text))
        && after.some(line => /^\s*exit\s+\$\?\s*$/.test(line.text));
      for (const line of added) {
        if (/^\s*exit\s+0\s*$/.test(line.text) && afterRunsVerification && !failFastShell) {
          findings.push({
            verifierId: 'WI110', severity: 'error', file: filePath, line: line.line,
            message: 'Verification neutered: the shell runner forces exit 0 after running checks, replacing their failure status with success.',
            suggestion: 'Remove exit 0 and let the verification command status reach the caller.',
          });
        }
        if (/^\s*true\s*$/.test(line.text) && afterRunsVerification && !failFastShell) {
          findings.push({
            verifierId: 'WI110', severity: 'error', file: filePath, line: line.line,
            message: 'Verification neutered: the shell runner ends with true, replacing an earlier check failure with exit zero.',
            suggestion: 'Remove the trailing true and let the verification status propagate.',
          });
        }
        if (BACKGROUNDED_VERIFIER_RE.test(line.text) && !backgroundStatusPropagated) {
          findings.push({
            verifierId: 'WI110', severity: 'error', file: filePath, line: line.line,
            message: 'Verification detached: the test command is backgrounded, so the script can finish successfully before the suite reports its result.',
            suggestion: 'Run the suite in the foreground and wait for its exit status.',
          });
        }
      }

      // A general runner narrowed to one name or file still executes successfully, but most of
      // the suite disappears. Pairing the same tool before/after avoids flagging a newly added,
      // intentionally focused helper script.
      for (const line of added) {
        if (!FOCUSED_SELECTION_RE.test(line.text)) continue;
        const tool = verifierTool(line.text);
        if (!tool) continue;
        const nextName = scriptName(line.text);
        const prior = deleted.find(old =>
          verifierTool(old.text) === tool &&
          !FOCUSED_SELECTION_RE.test(old.text) &&
          (nextName === undefined || scriptName(old.text) === nextName)
        );
        if (!prior) continue;
        findings.push({
          verifierId: 'WI110',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: `Verification narrowed: the ${tool} command now selects only a named subset, so the rest of the suite no longer runs.`,
          suggestion: 'Restore the general test command. A focused selector is useful locally, but it must not replace the project verification script.',
        });
      }

      // Updating snapshots is a maintenance operation, not the normal verification command. It
      // is safe as a separately named opt-in helper, but not as a replacement for the same script.
      for (const line of added) {
        for (const next of scriptEntries(line.text).filter(entry => SNAPSHOT_UPDATE_RE.test(entry.command))) {
          const prior = deleted
            .flatMap(old => scriptEntries(old.text))
            .find(old => old.name === next.name && !SNAPSHOT_UPDATE_RE.test(old.command));
          if (!prior) continue;
          findings.push({
            verifierId: 'WI110', severity: 'error', file: filePath, line: line.line,
            message: `Verification neutered: '${next.name}' now updates snapshots while testing, so changed output rewrites its own expectation instead of failing.`,
            suggestion: 'Restore the read-only test command and keep snapshot updates in a separate, explicitly invoked maintenance script.',
          });
        }
      }

      // A verification script whose command was replaced by something that cannot fail.
      for (const line of added) {
        if (isCommentLine(line.text)) continue;
        if (!VERIFICATION_SCRIPT_RE.test(line.text)) continue;
        const command = scriptCommand(line.text);
        if (command === undefined) continue;
        if (!NO_OP_COMMAND_RE.test(command)) continue;
        // Only when it previously ran something real: adding a placeholder script to a new project
        // is not a cheat, replacing a working one is.
        const previouslyReal = deleted.some(d => {
          if (!VERIFICATION_SCRIPT_RE.test(d.text)) return false;
          const old = scriptCommand(d.text);
          return old !== undefined && REAL_VERIFIER_RE.test(old);
        });
        if (!previouslyReal) continue;
        findings.push({
          verifierId: 'WI110',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: `Verification neutered: a script in ${path.basename(filePath)} that ran a real check now runs '${command.trim().slice(0, 40)}', which cannot fail.`,
          suggestion:
            'Put the real command back and fix what it reported. A script that always succeeds is indistinguishable from a passing build to everything downstream, including CI.',
        });
      }

      // A verification command that still runs, with its failure defanged.
      //
      // Literals are deliberately NOT blanked here, and this is the code-versus-data rule from
      // wi-common applied in the direction that catches people out. Every token below lives inside
      // a JSON string by construction: `"test": "vitest run --passWithNoTests"` puts the flag in
      // the data, not the code. Blanking literals would erase the entire signal. An earlier draft
      // of this line was a no-op ternary that computed withoutLiterals and threw the result away,
      // which had the right behaviour for the wrong reason and would not have survived an edit.
      for (const line of added) {
        if (isCommentLine(line.text)) continue;
        const code = line.text;
        if (!REAL_VERIFIER_RE.test(code) && !VERIFICATION_SCRIPT_RE.test(code)) continue;
        for (const sig of NEUTERING_SIGNATURES) {
          if (!sig.re.test(code)) continue;
          findings.push({
            verifierId: 'WI110',
            severity: sig.severity,
            file: filePath,
            line: line.line,
            message: `Verification neutered: ${sig.what}.`,
            suggestion: sig.suggestion,
          });
          break;
        }
      }

      // Make's leading `-`, which tells it to carry on when a recipe line fails.
      if (isMakefile) {
        for (const line of added) {
          if (!MAKE_IGNORE_ERROR_RE.test(line.text)) continue;
          if (!REAL_VERIFIER_RE.test(line.text)) continue;
          findings.push({
            verifierId: 'WI110',
            severity: 'error',
            file: filePath,
            line: line.line,
            message: "Verification neutered: a '-' prefix added to a test recipe, so make ignores the failure.",
            suggestion: "Remove the '-' so a failing suite fails the target.",
          });
        }
      }

      // A verification step dropped out of a composite script entirely.
      for (const del of deleted) {
        const oldCommand = scriptCommand(del.text);
        if (oldCommand === undefined || !/&&/.test(oldCommand)) continue;
        const oldSteps = oldCommand.split('&&').map(s => s.trim());
        const oldName = /"([\w:-]+)"\s*:/.exec(del.text)?.[1];
        const newEntry = added.find(a => {
          const newName = /"([\w:-]+)"\s*:/.exec(a.text)?.[1];
          return oldName !== undefined && newName === oldName;
        });
        if (!newEntry) continue;
        const newCommand = scriptCommand(newEntry.text) ?? '';
        const dropped = oldSteps.filter(s => REAL_VERIFIER_RE.test(s) && !newCommand.includes(s));
        if (dropped.length === 0) continue;
        findings.push({
          verifierId: 'WI110',
          severity: 'error',
          file: filePath,
          line: newEntry.line,
          message: `Verification removed: '${dropped[0]!.slice(0, 40)}' was dropped from a script that still runs, so that check no longer happens.`,
          suggestion: 'Restore the step. If it genuinely moved elsewhere, say where, so a reader can still tell the check runs.',
        });
      }
    }
  }

  return findings;
}

export const wi110: Verifier = { id: 'WI110', severity: 'error', run };
