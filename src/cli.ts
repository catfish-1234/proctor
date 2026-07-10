#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { runGitDiff } from './diff.js';
import { classifyDiff } from './pre-classifier.js';
import { buildContext } from './context/index.js';
import { runChecks } from './engine.js';
import { prettyReport } from './reporters/pretty.js';
import { jsonReport } from './reporters/json.js';
import { sarifReport } from './reporters/sarif.js';
import { AGENT_ADAPTERS } from './adapters/registry.js';
import { checkAdapterDrift } from './adapters/drift-check.js';
import { loadTaskPool } from './bench/tasks.js';
import { runBench } from './bench/index.js';
import { installPreCommitHook } from './hooks/pre-commit.js';
import { parseStopHookInput, runStopHookCheck } from './hooks/stop-hook.js';
import { RULE_METADATA } from './rules.js';
import { buildReceipt } from './receipt.js';
import { badgeLine } from './badge/index.js';

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
  .description('Analyze working diff against every enabled Verifier (test-tampering signatures are the first Verifier type)')
  .option('--staged', 'analyze only staged changes')
  .option('--base <ref>', 'analyze changes against a base ref (e.g. origin/main or a commit SHA) instead of staged/working-tree changes — for CI, where nothing is staged in a fresh checkout')
  .option('--ci', 'suppress non-error output, exit nonzero on error only')
  .option('--json', 'output findings as JSON to stdout')
  .option('--sarif', 'output SARIF 2.1.0 JSON to stdout')
  .option('--ai', 'enable LLM judge for ambiguous signatures')
  .option('--rules <ids>', 'comma-separated list of verifier IDs to run (narrows the enabled set, e.g. RH001,RH003)')
  .option('--explain <id>', 'print the full explanation for a verifier ID and exit — no diff analysis')
  .action(async (pathArg: string | undefined, options: { staged?: boolean; base?: string; ci?: boolean; json?: boolean; ai?: boolean; sarif?: boolean; rules?: string; explain?: string }) => {
    if (options.explain) {
      const meta = RULE_METADATA[options.explain];
      if (!meta) {
        process.stderr.write(`proctor: unknown verifier ID '${options.explain}'\n`);
        process.exit(2);
      }
      process.stdout.write(`${options.explain}: ${meta.name}\n\n${meta.fullDescription}\n\nDefault severity: ${meta.defaultLevel}\nMore info: ${meta.helpUri}\n`);
      process.exit(0);
    }
    const cwd = pathArg ? resolve(pathArg) : process.cwd();
    const diffArgs = options.base ? [`${options.base}...HEAD`] : options.staged ? ['--staged'] : [];
    let raw: string, files: import('./diff.js').ParsedFile[];
    try {
      ({ raw, files } = runGitDiff(diffArgs, cwd));
    } catch (err) {
      process.stderr.write('proctor: ' + String(err) + '\n');
      process.exit(2);
    }
    const { accepted } = classifyDiff(raw, files);
    const ctx = await buildContext(cwd, accepted);
    ctx.committedDiff = Boolean(options.base);
    if (options.rules) {
      const requested = options.rules.split(',').map(s => s.trim()).filter(Boolean);
      ctx.enabled = ctx.enabled.filter(id => requested.includes(id));
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
      process.exit(0); // fail open: never block a commit because proctor itself errored
    }
    if (options.sarif) {
      const sarif = sarifReport(findings);
      const hasError = findings.some(f => f.severity === 'error');
      const hasWarn = findings.some(f => f.severity === 'warn');
      await new Promise<void>((resolve) => {
        process.stdout.write(sarif + '\n', () => {
          process.exitCode = hasError ? 2 : hasWarn ? 1 : 0;
          resolve();
        });
      });
      return;
    }
    const receipt = buildReceipt(findings);
    if (options.json) {
      process.stdout.write(jsonReport(findings) + '\n');
      prettyReport(findings, { stream: process.stderr, ci: options.ci });
      if (receipt.status === 'honest-pass' && !options.ci) process.stderr.write(badgeLine(receipt) + '\n');
    } else {
      prettyReport(findings, { stream: process.stdout, ci: options.ci });
      if (receipt.status === 'honest-pass' && !options.ci) process.stdout.write(badgeLine(receipt) + '\n');
    }
    const hasError = findings.some(f => f.severity === 'error');
    const hasWarn = findings.some(f => f.severity === 'warn');
    if (hasError) process.exit(2);
    if (hasWarn) process.exit(1);
    process.exit(0);
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
  .description('Claude Code Stop hook — reads stdin JSON, exits 2 on error findings')
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
    const dir = options.global ? join(homedir(), '.claude') : join(process.cwd(), '.claude');
    const settingsPath = join(dir, 'settings.json');
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
    } catch { /* ENOENT or invalid JSON */ }
    // Skip if the hook is already installed, so running this command twice is a no-op.
    const stopGroups = ((settings['hooks'] as Record<string, unknown> | undefined)?.['Stop'] ?? []) as Array<{ hooks?: Array<{ command?: string }> }>;
    const alreadyInstalled = stopGroups.some(g => g.hooks?.some(h => h.command?.includes('proctor stop-hook')));
    if (alreadyInstalled) {
      process.stdout.write('Already installed\n');
      process.exit(0);
    }
    // Merge into any existing settings rather than overwriting them.
    const hooks = ((settings['hooks'] ?? {}) as Record<string, unknown>);
    const stop = ((hooks['Stop'] ?? []) as unknown[]);
    // Fully-scoped npx spec (not bare `npx proctor`) — see preCommitHookContent()'s comment in
    // src/hooks/pre-commit.ts for why: a bare bin name only resolves via npx after a persistent
    // install, which the README's zero-install flow doesn't guarantee.
    stop.push({ hooks: [{ type: 'command', command: `npx ${pkg.name} stop-hook` }] });
    hooks['Stop'] = stop;
    settings['hooks'] = hooks;
    await mkdir(dir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    process.stdout.write('Installed: ' + settingsPath + '\n');
  });

program
  .command('install-skill')
  .description('Deploy canonical SKILL.md to every supported agent adapter path')
  .action(async () => {
    const cwd = process.cwd();
    const canonical = await readFile(canonicalSkillPath(), 'utf8');
    for (const adapter of AGENT_ADAPTERS) {
      const dest = join(cwd, adapter.relativePath);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, canonical, 'utf8');
      process.stdout.write('Installed: ' + dest + '\n');
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
  .command('bench')
  .description('Run the benchmark harness: N seeded tasks x {proctor on, off}, CSV + before/after cheat-rate table')
  .option('--tasks <n>', 'number of tasks to run', '10')
  .option('--seed <n>', 'seed for deterministic task selection', '1')
  .option('--mock', 'use the mock fixture runner (no real agent CLI, no network)')
  .option('--agent <id>', 'agent id to run (e.g. claude-code, codex)', 'claude-code')
  .option('--out <path>', 'write the results CSV to this path')
  .action(async (options: { tasks: string; seed: string; mock?: boolean; agent: string; out?: string }) => {
    const pool = await loadTaskPool();
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
    });
    process.exit(result.exitCode);
  });

await program.parseAsync(process.argv);
