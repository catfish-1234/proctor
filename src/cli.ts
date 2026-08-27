#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import pkg from '../package.json' with { type: 'json' };
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hiddenTrackedPaths, runGitDiff } from './diff.js';
import { classifyDiff } from './pre-classifier.js';
import { buildContext, WI_CHECKS } from './context/index.js';
import { runChecks } from './engine.js';
import { prettyReport } from './reporters/pretty.js';
import { jsonReport } from './reporters/json.js';
import { sarifReport } from './reporters/sarif.js';
import { markdownReport } from './reporters/markdown.js';
import { AGENT_ADAPTERS, type AgentAdapter } from './adapters/registry.js';
import { detectAgents, selectAgents } from './adapters/detect.js';
import { checkAdapterDrift } from './adapters/drift-check.js';
import { deploySkill, uninstallProctor } from './adapters/deploy.js';
import { loadTaskPool } from './bench/tasks.js';
import { runBench } from './bench/index.js';
import { installPreCommitHook } from './hooks/pre-commit.js';
import { installStopHook } from './hooks/claude-settings.js';
import { parseStopHookInput, runStopHookCheck } from './hooks/stop-hook.js';
import { APPROVAL_GUIDANCE, RULE_METADATA } from './rules.js';
import { buildReceipt } from './receipt.js';
import { badgeLine, badgeUrl, badgeMarkdown } from './badge/index.js';
import type { ProctorConfig } from './types.js';
import pc from 'picocolors';
import { readTally, resetTally } from './session.js';
import { statuslineText } from './brand.js';
import { buildScoreReport } from './score.js';
import { scoreReport } from './reporters/score.js';
import { startWatch } from './watch.js';
import { spawnSync } from 'node:child_process';

/** True when the repository has at least one commit, so `HEAD` resolves. */
function hasCommit(cwd: string): boolean {
  return spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd, stdio: 'ignore' }).status === 0;
}

/**
 * The canonical ruleset, relative to this entrypoint. `../src/skill/SKILL.md` resolves correctly
 * both from `src/cli.ts` in a source checkout and from the bundled `dist/cli.js`, since both sit
 * one level under the package root. Keep it here: tsup bundles every module into this one file, so
 * `import.meta.url` in any other source file would not survive the build.
 */
function canonicalSkillPath(): string {
  return fileURLToPath(new URL('../src/skill/SKILL.md', import.meta.url));
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

const program = new Command();

program
  .name('proctor')
  .description('AI agent test-tampering guard')
  .version(pkg.version);

program
  .command('check [path]')
  .description('Analyze all uncommitted changes against every enabled Verifier (test-tampering signatures are the first Verifier type)')
  .option('--staged', 'analyze only staged changes')
  .option('--uncommitted', 'explicitly analyze the default scope: staged, unstaged, and untracked changes together')
  .option('--base <ref>', 'analyze changes against a base ref (e.g. origin/main or a commit SHA) instead of staged/working-tree changes, for CI, where nothing is staged in a fresh checkout')
  .option('--ci', 'suppress non-error output, exit nonzero on error only')
  .option('--json', 'output findings as JSON to stdout')
  .option('--sarif', 'output SARIF 2.1.0 JSON to stdout')
  .option('--ai', 'enable LLM judge for ambiguous signatures')
  .option('--rules <ids>', 'comma-separated list of verifier IDs to run (narrows the enabled set, e.g. RH001,RH003)')
  .option('--wi', 'also run the beta work-integrity family (WI1xx), which is opt-in by default')
  .option('--all-checks', 'run every check in the registry, the RH family and the beta WI family together')
  .option('--explain <id>', 'print the full explanation for a verifier ID and exit, no diff analysis')
  .option('--fix', 'with --explain, print what an honest fix looks like instead of the rule description')
  .option('--markdown <file>', 'also write a Markdown summary to this file, e.g. --markdown "$GITHUB_STEP_SUMMARY"')
  .action(async (pathArg: string | undefined, options: { staged?: boolean; uncommitted?: boolean; base?: string; ci?: boolean; json?: boolean; ai?: boolean; sarif?: boolean; rules?: string; wi?: boolean; allChecks?: boolean; explain?: string; fix?: boolean; markdown?: string }) => {
    if (options.fix && !options.explain) {
      process.stderr.write('proctor: --fix only applies with --explain, e.g. proctor check --explain RH001 --fix\n');
      process.exit(2);
    }
    if (options.explain) {
      const meta = RULE_METADATA[options.explain];
      if (!meta) {
        process.stderr.write(`proctor: unknown verifier ID '${options.explain}'\n`);
        process.exit(2);
      }
      if (options.json) {
        // Agents read this, and prose is the one format they have to guess at. Everything the
        // human-readable forms print is here as fields, so an agent can act on the fix guidance
        // without scraping it back out of a paragraph.
        process.stdout.write(
          JSON.stringify(
            {
              id: options.explain,
              name: meta.name,
              shortDescription: meta.shortDescription,
              fullDescription: meta.fullDescription,
              defaultLevel: meta.defaultLevel,
              fix: meta.fix,
              approvalGuidance: APPROVAL_GUIDANCE,
              helpUri: meta.helpUri,
            },
            null,
            2
          ) + '\n'
        );
        process.exit(0);
      }
      if (options.fix) {
        // Being blocked tells an agent only that something was wrong. This is the other half:
        // what to do instead, with the approval route stated last so it reads as the exception.
        process.stdout.write(
          `${options.explain}: ${meta.name}\n\nHow to fix this honestly:\n\n${meta.fix}\n\n${APPROVAL_GUIDANCE}\n\nMore info: ${meta.helpUri}\n`
        );
        process.exit(0);
      }
      process.stdout.write(`${options.explain}: ${meta.name}\n\n${meta.fullDescription}\n\nDefault severity: ${meta.defaultLevel}\nMore info: ${meta.helpUri}\nHonest fix: proctor check --explain ${options.explain} --fix\n`);
      process.exit(0);
    }
    const selectedScopes = [options.base !== undefined, options.staged === true, options.uncommitted === true]
      .filter(Boolean).length;
    if (selectedScopes > 1) {
      process.stderr.write('proctor: choose only one diff scope: --staged, --uncommitted, or --base <ref>\n');
      process.exit(2);
    }
    const cwd = pathArg ? resolve(pathArg) : process.cwd();
    // --end-of-options stops git from parsing a ref that begins with '-' as a git option
    // (e.g. --base "--output=x" would otherwise write the diff to a file).
    const allUncommitted = options.uncommitted === true || (!options.base && !options.staged);
    const diffArgs = options.base
      ? ['--end-of-options', `${options.base}...HEAD`]
      : allUncommitted
        // Staged and unstaged together. `git diff HEAD` needs a commit to compare against, so a
        // repository with no commits yet falls back to the index, which is all there is to see.
        ? hasCommit(cwd) ? ['HEAD'] : ['--staged']
        : ['--staged'];
    let raw: string, files: import('./diff.js').ParsedFile[];
    try {
      if (!options.base) {
        const hidden = hiddenTrackedPaths(cwd);
        if (hidden.length > 0) {
          process.stderr.write('proctor: ' + `tracked path(s) hidden by assume-unchanged/skip-worktree: ${hidden.slice(0, 5).join(', ')}${hidden.length > 5 ? ` (+${hidden.length - 5} more)` : ''}` + '\n');
          // Deliberately exit 2, not 3. A tracked file hidden with assume-unchanged is a state
          // an agent can set on purpose to make its change invisible, so it is a finding about the
          // change rather than proctor failing to run.
          process.exit(2);
        }
      }
      ({ raw, files } = runGitDiff(diffArgs, cwd, { includeUntracked: allUncommitted }));
    } catch (err) {
      const msg = String(err);
      // Give the common "not in a git repo" case a clean one-line message instead of git's raw
      // multi-line --no-index usage dump.
      const clean = /not a git repository/i.test(msg)
        ? `not a git repository (run proctor inside a git repo)`
        : msg.replace(/^Error:\s*/, '');
      process.stderr.write('proctor: ' + clean + '\n');
      // 3, not 2. git failing to produce a diff means proctor could not look, which is a
      // different claim from "a cheat was found". The pre-commit hook blocks on both and so still
      // fails closed; the Stop hook blocks on 2 and allows 3, which is its documented fail-open
      // policy. Exiting 2 here made an unreadable repository block an agent turn instead.
      process.exit(3);
    }
    const { accepted } = classifyDiff(raw, files);
    // Config comes from the diff baseline (HEAD, or the --base ref), never the working tree,
    // otherwise the diff being checked could disable proctor in the same change it cheats in.
    const ctx = await buildContext(cwd, accepted, { configRef: options.base ?? 'HEAD' });
    ctx.committedDiff = Boolean(options.base);
    // The WI family is opt-in for this release (see WI_CHECKS). A flag turns it on for one run;
    // listing the IDs in the committed config turns it on everywhere, hooks included. Added rather
    // than assigned, so a config that already enables some of them is not overwritten, and a config
    // that deliberately narrows the RH set keeps that narrowing.
    if (options.wi || options.allChecks) {
      ctx.enabled = [...new Set([...ctx.enabled, ...WI_CHECKS])];
    }
    if (options.rules) {
      const requested = options.rules.split(',').map(s => s.trim()).filter(Boolean);
      const unknown = requested.filter(id => !RULE_METADATA[id]);
      if (requested.length === 0 || unknown.length > 0) {
        // A typo'd rule list must not silently run zero verifiers and mint an honest pass.
        process.stderr.write(`proctor: unknown verifier ID(s) in --rules: ${unknown.join(', ') || '(empty list)'}\n`);
        process.exit(2);
      }
      ctx.enabled = ctx.enabled.filter(id => requested.includes(id));
      if (ctx.enabled.length === 0) {
        // Every requested ID is valid but none is in the active/config-enabled set, so the run
        // would check nothing and mint a false honest pass. Fail loudly instead.
        process.stderr.write(`proctor: --rules ${requested.join(',')} matched no enabled verifier (config 'enabled' may exclude them)\n`);
        process.exit(2);
      }
    }
    if (options.ai) {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        process.stderr.write('proctor: --ai requires ANTHROPIC_API_KEY env var. Set it or run without --ai.\n');
        process.exit(1);
      }
      const { createAnthropicJudge } = await import('./ai/judge.js');
      const model = ctx.aiModel ?? 'claude-haiku-4-5-20251001';
      ctx.aiEnabled = true;
      ctx.judge = createAnthropicJudge(apiKey, model);
    }
    let findings: import('./types.js').Finding[];
    try {
      findings = await runChecks(ctx);
    } catch (err) {
      process.stderr.write('proctor: check failed: ' + String(err) + '\n');
      // Distinct from a finding (2) and a warning (1). The pre-commit hook propagates this and
      // therefore fails closed; the Claude Stop hook deliberately blocks only on 2 and retains
      // its documented fail-open policy for infrastructure failures.
      process.exitCode = 3;
      return;
    }
    if (options.markdown) {
      // Appended, not overwritten: $GITHUB_STEP_SUMMARY is shared by every step in the job, so
      // truncating it would erase whatever ran before proctor.
      try {
        await appendFile(options.markdown, markdownReport(findings) + '\n', 'utf8');
      } catch (err) {
        // Reported, not swallowed. A summary that silently fails to write looks identical to a
        // clean run, which is the exact confusion this option exists to remove. It does not
        // change the exit code: the findings are the verdict, not the report file.
        process.stderr.write(`proctor: could not write --markdown file: ${String(err).replace(/^Error:\s*/, '')}\n`);
      }
    }
    if (options.sarif) {
      const sarif = sarifReport(findings);
      const hasError = findings.some(f => f.severity === 'error');
      const hasWarn = findings.some(f => f.severity === 'warn');
      await new Promise<void>((resolve) => {
        process.stdout.write(sarif + '\n', () => {
          // Same --ci contract as the non-SARIF path below: warnings only affect the exit
          // code when --ci is not set.
          process.exitCode = hasError ? 2 : hasWarn && !options.ci ? 1 : 0;
          resolve();
        });
      });
      return;
    }
    const receipt = buildReceipt(findings);
    if (options.json) {
      process.stdout.write(jsonReport(findings) + '\n');
      prettyReport(findings, { stream: process.stderr, ci: options.ci });
      if (receipt.status === 'honest-pass' && receipt.approvedCount === 0 && !options.ci) process.stderr.write(badgeLine(receipt) + '\n');
    } else {
      prettyReport(findings, { stream: process.stdout, ci: options.ci });
      if (receipt.status === 'honest-pass' && receipt.approvedCount === 0 && !options.ci) process.stdout.write(badgeLine(receipt) + '\n');
    }
    const hasError = findings.some(f => f.severity === 'error');
    const hasWarn = findings.some(f => f.severity === 'warn');
    // Set exitCode and return (rather than process.exit) so pending stdout pipe writes drain
    // before the process ends, same hazard the SARIF branch above guards against.
    // Under --ci, warnings do not affect the exit code ("exit nonzero on error only").
    process.exitCode = hasError ? 2 : hasWarn && !options.ci ? 1 : 0;
  });

program
  .command('install-hook')
  .description('Install git pre-commit hook')
  .action(async () => {
    const hookPath = await installPreCommitHook(process.cwd());
    process.stdout.write('Installed: ' + hookPath + '\n');
  });

program
  .command('stop-hook')
  .description('Claude Code Stop hook: reads stdin JSON, exits 2 on error findings')
  .action(async () => {
    const raw = await readStdin();
    const { cwd, skip } = parseStopHookInput(raw, process.cwd());
    if (skip) process.exit(0);
    const { exitCode, output } = runStopHookCheck(cwd, process.argv[1] ?? '');
    if (output) process.stderr.write(output);
    process.exit(exitCode);
  });

program
  .command('install-claude-hook')
  .description('Install Claude Code Stop hook')
  .option('--global', 'write to ~/.claude/settings.json')
  .action(async (options: { global?: boolean }) => {
    const result = await installStopHook(options.global ? join(homedir(), '.claude') : join(process.cwd(), '.claude'));
    if (result.status === 'invalid-json') {
      process.stderr.write(`proctor: ${result.path} exists but is not valid JSON; fix it manually and re-run\n`);
      process.exit(2);
    }
    process.stdout.write(result.status === 'already' ? 'Already installed\n' : 'Installed: ' + result.path + '\n');
  });

program
  .command('setup')
  .description('One-command install: writes the ruleset to every agent this repo uses, and installs both hooks')
  .option('--all', `write the ruleset to all ${AGENT_ADAPTERS.length} supported agents, not only the ones this repo uses`)
  .option('--agents <ids>', 'comma-separated agent ids to install to (e.g. claude-code,cursor), instead of detecting')
  .action(async (options: { all?: boolean; agents?: string }) => {
    // The whole product in one command. Three separate install steps is three chances to do one
    // of them and think you are covered, and the ruleset without the hooks is the configuration
    // this tool exists to argue against: rules an agent can decline to follow, with nothing
    // behind them.
    const cwd = process.cwd();

    const targets = await resolveTargets(cwd, options);
    const failed = await deploySkill(cwd, targets, await readFile(canonicalSkillPath(), 'utf8'));
    process.stdout.write(
      `Ruleset written to ${targets.length - failed} of ${targets.length} agent path${targets.length === 1 ? '' : 's'}.\n`
    );
    if (failed > 0) {
      // A setup that wrote part of the ruleset and exited 0 is indistinguishable from one that
      // worked, which is how a repo ends up believing it is guarded when it is not.
      process.stderr.write(`proctor: ${failed} adapter${failed === 1 ? '' : 's'} could not be written\n`);
      process.exitCode = 1;
    }

    try {
      const hookPath = await installPreCommitHook(cwd);
      process.stdout.write(`Pre-commit hook installed: ${hookPath}\n`);
    } catch (err: unknown) {
      // Outside a git repository there is nothing to hook. That is worth saying plainly, but it
      // is not a reason to abandon the rest of the setup.
      const msg = String(err).replace(/^Error:\s*/, '');
      process.stderr.write(`proctor: could not install the pre-commit hook (${msg})\n`);
      process.exitCode = 1;
    }

    // The Stop hook is Claude Code's own settings format, so it only goes in when Claude Code is
    // one of the targets. Writing .claude/settings.json into a repo that does not use Claude Code
    // is the same litter that detection exists to avoid.
    if (targets.some(a => a.id === 'claude-code')) {
      const stop = await installStopHook(join(cwd, '.claude'));
      if (stop.status === 'invalid-json') {
        process.stderr.write(`proctor: ${stop.path} is not valid JSON, so the Stop hook was not installed; fix it and re-run\n`);
        process.exitCode = 1;
      } else {
        process.stdout.write(
          stop.status === 'already' ? 'Stop hook already installed.\n' : `Stop hook installed: ${stop.path}\n`
        );
      }
    }

    process.stdout.write('\nDone. Your agent reads the rules before it works, and gets stopped if it breaks them.\n');
  });

program
  .command('install-skill')
  .description('Deploy canonical SKILL.md to the agent adapter paths this repo uses')
  .option('--all', `write to all ${AGENT_ADAPTERS.length} supported agents, not only the ones this repo uses`)
  .option('--agents <ids>', 'comma-separated agent ids to install to (e.g. claude-code,cursor), instead of detecting')
  .action(async (options: { all?: boolean; agents?: string }) => {
    const cwd = process.cwd();
    const failed = await deploySkill(
      cwd,
      await resolveTargets(cwd, options),
      await readFile(canonicalSkillPath(), 'utf8')
    );
    // Nonzero so a scripted install surfaces a partial deployment instead of looking like a
    // clean run that happened to print to stderr.
    if (failed > 0) {
      process.stderr.write(`proctor: ${failed} adapter${failed === 1 ? '' : 's'} could not be written\n`);
      process.exitCode = 1;
    }
  });

program
  .command('agents')
  .description('List every supported agent and whether this repo appears to use it')
  .action(async () => {
    const detected = new Set((await detectAgents(process.cwd())).map(a => a.id));
    for (const adapter of AGENT_ADAPTERS) {
      const mark = detected.has(adapter.id) ? pc.green('detected') : pc.dim('       -');
      process.stdout.write(`${mark}  ${adapter.id.padEnd(22)} ${pc.dim(adapter.relativePath)}\n`);
    }
    process.stdout.write(
      pc.dim(`\n${detected.size} of ${AGENT_ADAPTERS.length} detected. proctor setup installs to the detected ones; --all installs to every one.\n`)
    );
  });

/**
 * Which agents an install should write to: an explicit `--agents` list, all of them under `--all`,
 * or whatever this repository shows signs of using. Detection is the default because writing all
 * 30 adapters into a repo that uses two of them is 28 files of noise in the user's first commit.
 */
async function resolveTargets(cwd: string, options: { all?: boolean; agents?: string }): Promise<AgentAdapter[]> {
  if (options.agents !== undefined) {
    const ids = options.agents.split(',').map(s => s.trim()).filter(Boolean);
    const { selected, unknown } = selectAgents(ids);
    if (ids.length === 0 || unknown.length > 0) {
      process.stderr.write(
        `proctor: unknown agent id(s) in --agents: ${unknown.join(', ') || '(empty list)'}\n` +
        `proctor: run 'proctor agents' to see every supported id\n`
      );
      process.exit(2);
    }
    return selected;
  }
  if (options.all === true) return AGENT_ADAPTERS;
  const detected = await detectAgents(cwd);
  process.stdout.write(
    pc.dim(`Detected ${detected.length} agent${detected.length === 1 ? '' : 's'} in this repo: ${detected.map(a => a.id).join(', ')}\n`) +
    pc.dim(`Use --all for all ${AGENT_ADAPTERS.length} supported agents, or --agents <ids> to choose.\n\n`)
  );
  return detected;
}


program
  .command('badge')
  .description('Print the honest-pass badge for the current changes, as Markdown you can paste into a README')
  .option('--staged', 'judge staged changes instead of the working tree')
  .option('--url', 'print just the image URL instead of the Markdown snippet')
  .action(async (options: { staged?: boolean; url?: boolean }) => {
    const cwd = process.cwd();
    let files: import('./diff.js').ParsedFile[], raw: string;
    try {
      ({ raw, files } = runGitDiff(options.staged ? ['--staged'] : [], cwd));
    } catch (err) {
      const msg = String(err);
      const clean = /not a git repository/i.test(msg)
        ? 'not a git repository (run proctor inside a git repo)'
        : msg.replace(/^Error:\s*/, '');
      process.stderr.write('proctor: ' + clean + '\n');
      process.exit(2);
    }
    const { accepted } = classifyDiff(raw, files);
    const ctx = await buildContext(cwd, accepted, { configRef: 'HEAD' });
    const receipt = buildReceipt(await runChecks(ctx));
    process.stdout.write((options.url ? badgeUrl(receipt) : badgeMarkdown(receipt)) + '\n');
  });

program
  .command('uninstall')
  .description('Remove everything proctor installed in this repo: ruleset files, both hooks, and the adapter manifest')
  .option('--dry-run', 'list what would be removed without removing it')
  .action(async (options: { dryRun?: boolean }) => {
    const cwd = process.cwd();
    const { done, failed, note } = await uninstallProctor(cwd, options.dryRun === true);
    for (const line of done) process.stdout.write(line + '\n');
    for (const line of note) process.stdout.write(pc.dim(`note: ${line}\n`));
    for (const line of failed) process.stderr.write(`proctor: could not remove ${line}\n`);
    if (done.length === 0 && failed.length === 0) {
      process.stdout.write('Nothing to remove: proctor is not installed in this repo.\n');
      return;
    }
    process.stdout.write(
      options.dryRun
        ? `\n${done.length} item${done.length === 1 ? '' : 's'} would be removed. Re-run without --dry-run to remove them.\n`
        : '\nDone. proctor.config.json is left in place, since it is yours to keep or delete.\n'
    );
    if (failed.length > 0) {
      // A partial uninstall that exits 0 leaves the user believing proctor is gone when some of
      // it is still installed and still running.
      process.stderr.write(`proctor: ${failed.length} item(s) could not be removed; remove them by hand\n`);
      process.exitCode = 1;
    }
  });

program
  .command('drift-check')
  .description('Verify every deployed agent adapter still matches canonical SKILL.md')
  .action(async () => {
    const cwd = process.cwd();
    const canonical = await readFile(canonicalSkillPath(), 'utf8');
    const { drifted } = await checkAdapterDrift(cwd, canonical);
    for (const path of drifted) {
      process.stderr.write('Drifted: ' + path + '\n');
    }
    process.exit(drifted.length > 0 ? 1 : 0);
  });

program
  .command('watch')
  .description('Re-run a check whenever files change, for use alongside an agent session')
  .option('--staged', 'check staged changes instead of the working tree')
  .option('--rules <ids>', 'comma-separated list of verifier IDs to run')
  .option('--debounce <ms>', 'quiet period before re-running after a change', '250')
  .action(async (options: { staged?: boolean; rules?: string; debounce: string }) => {
    const cwd = process.cwd();
    const debounceMs = Number.parseInt(options.debounce, 10);
    if (!Number.isInteger(debounceMs) || debounceMs < 0) {
      process.stderr.write(`proctor: --debounce must be a non-negative integer, got '${options.debounce}'\n`);
      process.exit(2);
    }
    if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'ignore' }).status !== 0) {
      process.stderr.write('proctor: not a git repository (run proctor inside a git repo)\n');
      process.exit(2);
    }

    const args = ['check', ...(options.staged ? ['--staged'] : []), ...(options.rules ? ['--rules', options.rules] : [])];
    const runOnce = async (): Promise<void> => {
      // A child process per run, so a check that throws or wedges cannot take the watcher with it.
      const result = spawnSync(process.execPath, [process.argv[1] ?? '', ...args], {
        cwd, encoding: 'utf8', timeout: 120_000,
      });
      const stamp = new Date().toLocaleTimeString();
      process.stdout.write(`\n${pc.dim('[' + stamp + ']')} ${pc.bold('proctor ' + args.join(' '))}\n`);
      process.stdout.write((result.stdout ?? '') + (result.stderr ?? ''));
      if (result.error) process.stdout.write(pc.red(`run failed: ${result.error.message}\n`));
      await Promise.resolve();
    };

    process.stdout.write(pc.dim(`Watching ${cwd} for changes. Ctrl-C to stop.\n`));
    await runOnce();
    const handle = startWatch(cwd, runOnce, { debounceMs });
    const stop = (): void => {
      handle.close();
      process.stdout.write(pc.dim('\nStopped watching.\n'));
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

program
  .command('score')
  .description('Score recent commits for honesty: how many landed with no blocking finding')
  .option('--last <n>', 'how many commits to score, newest first', '20')
  .option('--author <pattern>', 'only score commits by authors matching this git --author pattern')
  .option('--all', 'list every scored commit, not just the ones with findings')
  .option('--json', 'output the report as JSON')
  .option('--min-rate <percent>', 'exit 2 when the honesty rate falls below this percentage, for use as a CI gate')
  .action(async (options: { last: string; author?: string; all?: boolean; json?: boolean; minRate?: string }) => {
    const limit = Number.parseInt(options.last, 10);
    if (!Number.isInteger(limit) || limit < 1) {
      process.stderr.write(`proctor: --last must be a positive integer, got '${options.last}'\n`);
      process.exit(2);
    }
    let minRate: number | undefined;
    if (options.minRate !== undefined) {
      minRate = Number(options.minRate);
      if (!Number.isFinite(minRate) || minRate < 0 || minRate > 100) {
        process.stderr.write(`proctor: --min-rate must be a percentage between 0 and 100, got '${options.minRate}'\n`);
        process.exit(2);
      }
    }
    try {
      const report = await buildScoreReport(process.cwd(), limit, options.author);
      if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else scoreReport(report, { all: options.all });
      if (minRate !== undefined) {
        // An undefined rate means nothing was scorable, so there is no evidence either way.
        // Failing the gate on no evidence would block a repository for having no history, so
        // this reports the reason and passes.
        if (report.honestyRate === undefined) {
          process.stderr.write('proctor: no commits could be scored, so --min-rate has nothing to check\n');
          return;
        }
        const actual = report.honestyRate * 100;
        if (actual < minRate) {
          process.stderr.write(
            `proctor: honesty rate ${actual.toFixed(1)}% is below the required ${minRate}% over ${report.commits.length} commit(s)\n`
          );
          process.exitCode = 2;
        }
      }
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/, '');
      const clean = /not a git repository/i.test(msg) ? 'not a git repository (run proctor inside a git repo)' : msg;
      process.stderr.write('proctor: ' + clean + '\n');
      process.exit(2);
    }
  });

program
  .command('statusline')
  .description('Print a one-line status for an agent status bar: how much proctor has caught in this checkout')
  .option('--reset', 'clear the tally and exit')
  .option('--plain', 'no color, for status bars that do not render ANSI')
  .action((options: { reset?: boolean; plain?: boolean }) => {
    const cwd = process.cwd();
    if (options.reset) {
      process.stdout.write(resetTally(cwd) ? 'proctor: tally reset\n' : 'proctor: not a git repository, nothing to reset\n');
      return;
    }
    const { caught } = readTally(cwd);
    const text = statuslineText(caught);
    // Status bars poll this constantly, so it must never fail or block: readTally already falls
    // back to a zeroed tally, and outside a repo that reads as "watching" rather than an error.
    process.stdout.write((options.plain ? text : caught === 0 ? pc.green(text) : pc.red(text)) + '\n');
  });

program
  .command('approve <rule> <file>')
  .description('Record a genuine test change in proctor.config.json so it stops blocking (it stays visible in every report)')
  .requiredOption('-r, --reason <text>', 'why this change is legitimate')
  .action(async (rule: string, file: string, options: { reason: string }) => {
    if (!RULE_METADATA[rule]) {
      process.stderr.write(`proctor: unknown verifier ID '${rule}'\n`);
      process.exit(2);
    }
    if (options.reason.trim() === '') {
      process.stderr.write('proctor: --reason cannot be empty\n');
      process.exit(2);
    }
    const configPath = join(process.cwd(), 'proctor.config.json');
    let config: ProctorConfig = {};
    try {
      config = JSON.parse(await readFile(configPath, 'utf8')) as ProctorConfig;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.stderr.write(`proctor: could not read ${configPath}: ${String(err)}\n`);
        process.exit(2);
      }
    }
    const normalizedFile = file.replace(/\\/g, '/');
    // The config is hand-editable, so approvedTestChanges may be any shape. Refuse to write
    // rather than crashing on it, and never silently discard whatever is there.
    if (config.approvedTestChanges !== undefined && !Array.isArray(config.approvedTestChanges)) {
      process.stderr.write(
        `proctor: 'approvedTestChanges' in ${configPath} is not an array; fix it by hand before approving\n`
      );
      process.exit(2);
    }
    const approvals = config.approvedTestChanges ?? [];
    const existing = approvals.find(a => a.rule === rule && a.file === normalizedFile);
    if (existing) {
      existing.reason = options.reason;
    } else {
      approvals.push({ rule, file: normalizedFile, reason: options.reason });
    }
    config.approvedTestChanges = approvals;
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    process.stdout.write(`Approved ${rule} for ${normalizedFile} in proctor.config.json\n`);
    // Approvals are read from the committed config, so an uncommitted one has no effect yet.
    // Saying so here avoids the obvious confusion of running check straight afterwards and
    // watching the finding block anyway.
    process.stdout.write('Commit proctor.config.json for this to take effect. proctor reads approvals from the committed config, so a change cannot approve itself.\n');
  });

program
  .command('bench')
  .description('Run the benchmark harness: N seeded tasks x {proctor on, off}, CSV + before/after cheat-rate table')
  .option('--tasks <n>', 'number of tasks to run', '10')
  .option('--seed <n>', 'seed for deterministic task selection', '1')
  .option('--mock', 'use the mock fixture runner (no real agent CLI, no network)')
  .option('--agent <id>', 'agent id to run (e.g. claude-code, codex)', 'claude-code')
  .option('--out <path>', 'write the results CSV to this path')
  .option('--resume', "carry completed tasks over from a previous attempt's <out>.partial.csv instead of re-running them")
  .action(async (options: { tasks: string; seed: string; mock?: boolean; agent: string; out?: string; resume?: boolean }) => {
    const pool = await loadTaskPool();
    if (pool.length === 0) {
      // The task corpus lives in bench/ and is deliberately not in the npm tarball: it is a
      // research fixture, not something every install should carry. Say that, rather than
      // reporting the empty pool as a bad --tasks value.
      process.stderr.write(
        'proctor: no benchmark tasks found. The task corpus ships with the repository, not the npm package.\n' +
        'proctor: clone it and run bench from there:\n' +
        '  git clone https://github.com/catfish-1234/proctor && cd proctor && npm install && npm run build\n' +
        '  node dist/cli.js bench --mock\n'
      );
      process.exit(2);
    }
    const tasksNum = Number(options.tasks);
    const seedNum = Number(options.seed);
    if (!Number.isInteger(tasksNum) || tasksNum < 1 || tasksNum > pool.length) {
      process.stderr.write(`proctor: --tasks must be an integer between 1 and ${pool.length} (pool size)\n`);
      process.exit(2);
    }
    if (!Number.isInteger(seedNum)) {
      process.stderr.write('proctor: --seed must be an integer\n');
      process.exit(2);
    }
    const result = await runBench({
      tasks: tasksNum,
      seed: seedNum,
      mock: options.mock === true,
      agent: options.agent,
      outPath: options.out,
      resume: options.resume === true,
    });
    process.exit(result.exitCode);
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  // Node's default for an uncaught exception is exit 1, but check uses 1 for warning-only
  // findings and the pre-commit hook deliberately allows that code. Normalize unexpected command
  // failures to the infrastructure code so a crash can never masquerade as an allowed warning.
  process.stderr.write(`proctor: command failed: ${String(err)}\n`);
  process.exitCode = 3;
}
