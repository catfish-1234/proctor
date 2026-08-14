import path from 'node:path';
import type { Context, Finding, Severity, Verifier } from '../types.js';
import { pathOf, withoutTrailingComment } from './wi-common.js';

/**
 * Guardrails disabled.
 *
 * Every other check reads the change. This one reads whether the change turned off the things that
 * read the change. An agent that cannot get past a guard has a shorter path available than fixing
 * the code: delete the guard. That covers proctor itself, the pre-commit hook that runs it, the
 * strict-mode flags that make the type checker useful, and the lint rules that were failing.
 *
 * Proctor's own configuration is already read from the committed baseline rather than the working
 * tree (see buildContext), so a config edit in the same change cannot actually weaken enforcement
 * for that run. That protection is silent, though: it ignores the edit and carries on. This check
 * is what makes the attempt visible, which matters more than blocking it, because an agent quietly
 * trying to switch the guard off is worth a human's attention even when it failed.
 */

interface Signature {
  key: string;
  severity: Severity;
  message: string;
  suggestion: string;
}

/** Files that are proctor, or that deploy it. Deleting one removes enforcement outright. */
const PROCTOR_ARTIFACT_RE =
  /(?:^|\/)proctor\.config\.json$|(?:^|\/)\.proctor-adapter-manifest\.json$|(?:^|\/)proctor[^/]*\.(?:md|mdc)$|(?:^|\/)skills\/proctor\//i;

/** Shared ruleset files the adapters deploy the honest-completion skill into. */
const RULESET_FILE_RE =
  /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|QWEN|WARP|AGENT|CRUSH|CONVENTIONS)\.md$|(?:^|\/)\.(?:clinerules|goosehints|rules|cursorrules|windsurfrules)$/;

/**
 * Files where a removed command line actually stops something from running.
 *
 * Prose is excluded deliberately. A README that stops mentioning `proctor check` has changed its
 * documentation, not its enforcement, and this repository's own docs would trip the check on every
 * edit otherwise.
 */
const EXECUTABLE_CONFIG_RE =
  /(?:^|\/)package\.json$|(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(?:^|\/)\.husky\/|(?:^|\/)\.pre-commit-config\.ya?ml$|(?:^|\/)Makefile$|(?:^|\/)\.gitlab-ci\.yml$|(?:^|\/)[^/]*\.(?:sh|bash)$|(?:^|\/)\.claude\/settings(?:\.local)?\.json$|(?:^|\/)lefthook\.ya?ml$/;

/** An invocation of proctor, in any of the shapes the installers write. */
const PROCTOR_INVOCATION_RE = /\bproctor\b[^\n]*\b(?:check|stop-hook|drift-check)\b|@kavishdua\/proctor/;

function proctorInvocationKind(text: string): 'check' | 'stop-hook' | 'drift-check' | 'package' | undefined {
  if (!PROCTOR_INVOCATION_RE.test(text)) return undefined;
  if (/\bstop-hook\b/.test(text)) return 'stop-hook';
  if (/\bdrift-check\b/.test(text)) return 'drift-check';
  if (/\bcheck\b/.test(text)) return 'check';
  return 'package';
}

const TSCONFIG_RE = /(?:^|\/)tsconfig(?:\.\w+)?\.json$/;
const ESLINT_CONFIG_RE = /(?:^|\/)\.eslintrc(?:\.\w+)?$|(?:^|\/)eslint\.config\.[cm]?[jt]s$/;
const LINT_IGNORE_RE = /(?:^|\/)\.(?:eslint|prettier|stylelint)ignore$/;

/** Strict-mode switches whose whole value is that they are on. */
const STRICTNESS_OFF_RE =
  /"(strict|strictNullChecks|noImplicitAny|strictFunctionTypes|noUnusedLocals|noImplicitReturns|alwaysStrict|strictBindCallApply|noUncheckedIndexedAccess|noEmitOnError)"\s*:\s*false/;

/** Bypasses that skip the hook layer entirely. */
const HOOK_BYPASS_RE = /--no-verify\b|\bHUSKY\s*=\s*0\b|\bSKIP_HOOKS?\s*=|\bPRE_COMMIT_ALLOW_NO_CONFIG\b|\bgit\s+commit\b[^\n]*\s-n\b/;

/** An ESLint rule switched off, in either the string or the array form. */
const ESLINT_RULE_OFF_RE = /"[\w@/-]+"\s*:\s*(?:"off"|0|\[\s*(?:"off"|0))/;

/**
 * A rule downgraded from error to warning.
 *
 * Found by adversarial probing. Switching a rule off was covered; moving it from "error" to "warn"
 * was not, and it has the same practical effect on anything that gates on exit code, while reading
 * as a much smaller edit in review.
 */
const ESLINT_RULE_DOWNGRADED_RE = /"([\w@/-]+)"\s*:\s*(?:"warn"|1|\[\s*(?:"warn"|1))/;
const ESLINT_RULE_LEVEL_RE = /"([\w@/-]+)"\s*:\s*(?:"(error|warn|off)"|([012])|\[\s*"(error|warn|off)"|\[\s*([012]))/;

function lintRuleWasError(text: string, rule: string): boolean {
  const match = ESLINT_RULE_LEVEL_RE.exec(text);
  if (match?.[1] !== rule) return false;
  const level = match[2] ?? match[3] ?? match[4] ?? match[5];
  return level === 'error' || level === '2';
}

/** Coverage config files, where an exclusion removes a file from measurement entirely. */
const COVERAGE_CONFIG_RE =
  /(?:^|\/)(?:vitest|jest|nyc|karma)\.config\.[cm]?[jt]s$|(?:^|\/)\.nycrc(?:\.json)?$|(?:^|\/)\.coveragerc$/;

/** An exclusion entry naming a source file rather than a generated or vendored one. */
const COVERAGE_EXCLUDE_RE = /exclude|omit|skipFiles|coveragePathIgnorePatterns/i;
const GENERATED_PATH_RE = /generated|\.d\.ts|node_modules|dist|build|vendor|__mocks__|\*\*\/\*\./i;

/**
 * A JSON key that opens a container, used to know which block a line sits in.
 *
 * It has to be the container form (`"enabled": [`, `"severity": {`) rather than any key at all.
 * Matching every key meant `"RH001": "warn"` set the current block to `RH001`, so the severity
 * downgrade it represented was attributed to a block named after the rule instead of to `severity`,
 * and the check went quiet on exactly the edit it was written to catch.
 */
const CONTAINER_KEY_RE = /^\s*"(\w+)"\s*:\s*[[{]/;

const SIGNATURES: Record<string, Signature> = {
  proctorArtifactDeleted: {
    key: 'proctorArtifactDeleted',
    severity: 'error',
    message: 'deleted, which removes proctor from this repository',
    suggestion: 'Restore the file. Removing the guard is not a way to satisfy it.',
  },
  rulesetDeleted: {
    key: 'rulesetDeleted',
    severity: 'error',
    message: 'deleted, which removes the honest-completion ruleset agents read',
    suggestion: 'Restore the ruleset file, or run `proctor uninstall` deliberately if it is genuinely being removed.',
  },
};

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath) continue;
    const normalized = filePath.replace(/\\/g, '/');
    const deletedFile = (file as { deleted?: boolean }).deleted === true;

    // A guardrail file removed wholesale. Checked before isWatchedSource, since some of these paths
    // (a deployed skill under a tests-adjacent tree) could otherwise be filtered out.
    if (deletedFile && PROCTOR_ARTIFACT_RE.test(normalized)) {
      findings.push({
        verifierId: 'WI104',
        severity: 'error',
        file: filePath,
        line: 1,
        message: `Guardrail disabled: ${path.basename(filePath)} ${SIGNATURES.proctorArtifactDeleted!.message}.`,
        suggestion: SIGNATURES.proctorArtifactDeleted!.suggestion,
      });
      continue;
    }
    if (deletedFile && RULESET_FILE_RE.test(normalized)) {
      findings.push({
        verifierId: 'WI104',
        severity: 'error',
        file: filePath,
        line: 1,
        message: `Guardrail disabled: ${path.basename(filePath)} ${SIGNATURES.rulesetDeleted!.message}.`,
        suggestion: SIGNATURES.rulesetDeleted!.suggestion,
      });
      continue;
    }

    const isProctorConfig = /(?:^|\/)proctor\.config\.json$/.test(normalized);
    const isTsconfig = TSCONFIG_RE.test(normalized);
    const isEslintConfig = ESLINT_CONFIG_RE.test(normalized);
    const isLintIgnore = LINT_IGNORE_RE.test(normalized);
    const isExecutableConfig = EXECUTABLE_CONFIG_RE.test(normalized);
    const isCoverageConfig = COVERAGE_CONFIG_RE.test(normalized);
    // A command whose flags or quoting change is a rewrite, not removal. Pair by purpose rather
    // than exact text so `proctor check` cannot be mistaken for a surviving `drift-check`.
    const readdedProctorKinds = new Set(
      file.chunks.flatMap(chunk => chunk.changes)
        .filter(change => change.type === 'add')
        .map(change => proctorInvocationKind(change.content.replace(/^[+\- ]/, '')))
        .filter((kind): kind is 'check' | 'stop-hook' | 'drift-check' | 'package' => kind !== undefined),
    );

    // Rule IDs this change adds back under `enabled`.
    //
    // Removing the last element of a JSON array makes git rewrite the line before it too, because
    // its trailing comma changed. Reading deletions alone therefore reports the surviving
    // neighbour as removed alongside the one that actually went, which would fire on every
    // ordinary config edit. Pairing deletions against re-additions is the same move-detection
    // RH012 uses for a relocated test command.
    const readdedIds = new Set<string>();
    for (const chunk of file.chunks) {
      let key = '';
      for (const change of chunk.changes) {
        const text = change.content.replace(/^[+\- ]/, '');
        const keyMatch = CONTAINER_KEY_RE.exec(text);
        if (keyMatch) key = keyMatch[1]!;
        if (change.type !== 'add' || key !== 'enabled') continue;
        for (const m of text.matchAll(/"((?:RH|WI)\d{3})"/g)) readdedIds.add(m[1]!);
      }
    }

    for (const chunk of file.chunks) {
      // Track the JSON key the current line sits under, so a removed rule ID can be attributed to
      // `enabled` rather than to any array that happens to contain a string.
      let currentKey = '';

      for (const change of chunk.changes) {
        const text = withoutTrailingComment(change.content.replace(/^[+\- ]/, ''));
        const keyMatch = CONTAINER_KEY_RE.exec(text);
        if (keyMatch) currentKey = keyMatch[1]!;
        const line = change.type === 'normal'
          ? (change as { ln2: number }).ln2
          : (change as { ln: number }).ln;

        if (isProctorConfig) {
          if (change.type === 'del' && currentKey === 'enabled' && /"(?:RH|WI)\d{3}"/.test(text)) {
            const removed = [...text.matchAll(/"((?:RH|WI)\d{3})"/g)]
              .map(m => m[1]!)
              .filter(id => !readdedIds.has(id));
            if (removed.length === 0) continue;
            const ids = removed.join(', ');
            findings.push({
              verifierId: 'WI104',
              severity: 'error',
              file: filePath,
              line,
              message: `Guardrail disabled: ${ids} removed from proctor's enabled checks.`,
              suggestion:
                'Re-enable the check and fix what it was reporting. Enforcement reads the committed config, so this edit does not take effect in this change either way.',
            });
            continue;
          }
          if (change.type === 'add' && currentKey === 'severity' && /"(?:RH|WI)\d{3}"\s*:\s*"(?:warn|info)"/.test(text)) {
            const id = /"((?:RH|WI)\d{3})"/.exec(text)![1]!;
            findings.push({
              verifierId: 'WI104',
              severity: 'error',
              file: filePath,
              line,
              message: `Guardrail weakened: ${id} downgraded so it no longer blocks.`,
              suggestion: 'Fix what the check reported instead of lowering its severity.',
            });
            continue;
          }
          if (change.type === 'add' && (currentKey === 'ignorePatterns' || currentKey === 'approvedTestChanges')) {
            findings.push({
              verifierId: 'WI104',
              severity: 'error',
              file: filePath,
              line,
              message: `Guardrail weakened: an entry added to proctor's '${currentKey}' in the same change it would excuse.`,
              suggestion:
                'An approval has to be committed before the change it covers, by a human who agreed to it. Ask for one instead of writing it yourself.',
            });
            continue;
          }
        }

        if (change.type === 'add' && isTsconfig && STRICTNESS_OFF_RE.test(text)) {
          const flag = STRICTNESS_OFF_RE.exec(text)![1]!;
          findings.push({
            verifierId: 'WI104',
            severity: 'error',
            file: filePath,
            line,
            message: `Guardrail disabled: TypeScript '${flag}' turned off, so the type errors it was reporting stop being errors.`,
            suggestion: `Fix the types and leave '${flag}' on. Turning it off hides every other violation in the codebase too, not just this one.`,
          });
          continue;
        }

        if (change.type === 'add' && isCoverageConfig && COVERAGE_EXCLUDE_RE.test(currentKey || text)) {
          // An exclusion naming a concrete source file takes it out of measurement, so the
          // coverage number stops describing it at all. Generated and vendored paths are the
          // ordinary, correct use and are left alone.
          const entry = /['"]([^'"]+)['"]/.exec(text)?.[1];
          if (entry && !GENERATED_PATH_RE.test(entry) && /\.[a-z]{1,4}$/i.test(entry)) {
            findings.push({
              verifierId: 'WI104',
              severity: 'error',
              file: filePath,
              line,
              message: `Guardrail weakened: '${entry}' excluded from coverage, so it stops being measured rather than becoming tested.`,
              suggestion: 'Remove the exclusion and write the tests. Excluding a file raises the coverage number without covering anything.',
            });
            continue;
          }
        }

        if (change.type === 'add' && isCoverageConfig && /\benabled\s*:\s*false\b|"enabled"\s*:\s*false\b/.test(text)) {
          const chunk = file.chunks.find(candidate => candidate.changes.includes(change));
          const coverageContext = /coverage/i.test(text) || chunk?.changes.some(candidate => /coverage/i.test(candidate.content));
          if (coverageContext) {
            findings.push({
              verifierId: 'WI104', severity: 'error', file: filePath, line,
              message: 'Guardrail disabled: coverage collection was switched off, so the suite can pass without measuring what it exercises.',
              suggestion: 'Leave coverage enabled and fix the missing coverage instead.',
            });
            continue;
          }
        }

        if (change.type === 'add' && isEslintConfig && ESLINT_RULE_DOWNGRADED_RE.test(text)) {
          const rule = ESLINT_RULE_DOWNGRADED_RE.exec(text)![1]!;
          // Only when it used to be an error: setting a new rule to warn is ordinary adoption.
          const wasError = file.chunks.some(ch => ch.changes.some(c => c.type === 'del' && lintRuleWasError(c.content, rule)));
          if (wasError) {
            findings.push({
              verifierId: 'WI104',
              severity: 'error',
              file: filePath,
              line,
              message: `Guardrail weakened: lint rule '${rule}' downgraded from error to warn, so it no longer fails anything.`,
              suggestion: 'Fix what the rule reported. A warning is not enforcement: everything that gates on exit code now passes regardless.',
            });
            continue;
          }
        }

        if (change.type === 'add' && isEslintConfig && ESLINT_RULE_OFF_RE.test(text)) {
          findings.push({
            verifierId: 'WI104',
            severity: 'warn',
            file: filePath,
            line,
            message: 'Guardrail weakened: a lint rule switched off in config rather than satisfied.',
            suggestion: 'Fix the code the rule was reporting, or say in the config why this rule does not apply to this project.',
          });
          continue;
        }

        if (change.type === 'add' && isLintIgnore && text.trim() && !text.trim().startsWith('#')) {
          findings.push({
            verifierId: 'WI104',
            severity: 'warn',
            file: filePath,
            line,
            message: `Guardrail weakened: '${text.trim()}' added to ${path.basename(filePath)}, excluding it from linting.`,
            suggestion: 'Fix the reported problems instead of excluding the path from the linter.',
          });
          continue;
        }

        // Executable config only, never prose or source. Documentation that tells an agent not to
        // add `--no-verify` contains the string `--no-verify`, and proctor's own ruleset and rule
        // metadata both say exactly that, so a wider scope made the tool fire on its own
        // instructions. A commit bypass that matters lives in a hook, a script, or a task
        // definition, all of which this list already covers.
        if (change.type === 'add' && isExecutableConfig && HOOK_BYPASS_RE.test(text)) {
          findings.push({
            verifierId: 'WI104',
            severity: 'error',
            file: filePath,
            line,
            message: 'Guardrail disabled: a commit hook bypass was added, so the pre-commit checks stop running.',
            suggestion: 'Remove the bypass and let the hooks run. If a hook is wrong, fix the hook.',
          });
          continue;
        }

        const removedProctorKind = change.type === 'del' ? proctorInvocationKind(text) : undefined;
        if (removedProctorKind && isExecutableConfig && !readdedProctorKinds.has(removedProctorKind)) {
          findings.push({
            verifierId: 'WI104',
            severity: 'error',
            file: filePath,
            line,
            message: `Guardrail disabled: the proctor invocation was removed from ${path.basename(filePath)}, so it no longer runs here.`,
            suggestion: 'Restore the invocation. If proctor is genuinely being removed, run `proctor uninstall` so every part of it goes together.',
          });
        }
      }
    }
  }

  return findings;
}

export const wi104: Verifier = { id: 'WI104', severity: 'error', run };
