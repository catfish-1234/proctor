#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { runGitDiff } from './diff.js';
import { classifyDiff } from './pre-classifier.js';
import { buildRepoContext } from './context.js';
import { runChecks } from './engine.js';
import { prettyReport } from './reporters/pretty.js';
import { jsonReport } from './reporters/json.js';
import { sarifReport } from './reporters/sarif.js';
import { AGENT_ADAPTERS } from './adapters/registry.js';
import { checkAdapterDrift } from './adapters/drift-check.js';

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
  .description('Analyze working diff for test-tampering signatures')
  .option('--staged', 'analyze only staged changes')
  .option('--ci', 'suppress non-error output, exit nonzero on error only')
  .option('--json', 'output findings as JSON to stdout')
  .option('--sarif', 'output SARIF 2.1.0 JSON to stdout')
  .option('--ai', 'enable LLM judge for ambiguous signatures')
  .action(async (pathArg: string | undefined, options: { staged?: boolean; ci?: boolean; json?: boolean; ai?: boolean; sarif?: boolean }) => {
    const cwd = pathArg ? resolve(pathArg) : process.cwd();
    const diffArgs = options.staged ? ['--staged'] : [];
    let raw: string, files: import('./diff.js').ParsedFile[];
    try {
      ({ raw, files } = runGitDiff(diffArgs, cwd));
    } catch (err) {
      process.stderr.write('proctor: ' + String(err) + '\n');
      process.exit(2);
    }
    const { accepted } = classifyDiff(raw, files);
    const ctx = await buildRepoContext(cwd);
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
      findings = await runChecks(accepted, ctx);
    } catch (err) {
      process.stderr.write('proctor: check failed: ' + String(err) + '\n');
      process.exit(0); // fail-open per D-05
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
    if (options.json) {
      process.stdout.write(jsonReport(findings) + '\n');
      prettyReport(findings, { stream: process.stderr, ci: options.ci });
    } else {
      prettyReport(findings, { stream: process.stdout, ci: options.ci });
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
    const cwd = process.cwd();
    const hookContent = '#!/bin/sh\nnpx proctor check --staged\n';

    let hasHusky = false;
    try {
      const pkgJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as Record<string, unknown>;
      hasHusky = 'husky' in ((pkgJson['devDependencies'] ?? {}) as Record<string, unknown>);
    } catch { /* ENOENT or parse failure */ }

    if (hasHusky) {
      const hookPath = join(cwd, '.husky', 'pre-commit');
      await mkdir(join(cwd, '.husky'), { recursive: true });
      await writeFile(hookPath, hookContent, 'utf8');
      spawnSync('git', ['add', '--chmod=+x', hookPath], { cwd });
      process.stdout.write('Installed: ' + hookPath + '\n');
    } else {
      const hookPath = join(cwd, '.git', 'hooks', 'pre-commit');
      await mkdir(join(cwd, '.git', 'hooks'), { recursive: true });
      await writeFile(hookPath, hookContent, 'utf8');
      try { chmodSync(hookPath, 0o755); } catch { /* Windows — acceptable */ }
      process.stdout.write('Installed: ' + hookPath + '\n');
    }
  });

program
  .command('stop-hook')
  .description('Claude Code Stop hook — reads stdin JSON, exits 2 on error findings')
  .action(async () => {
    const raw = await readStdin();
    let cwd = process.cwd();
    try {
      const input = JSON.parse(raw) as Record<string, unknown>;
      if (input['stop_hook_active'] === true) process.exit(0);
      if (typeof input['cwd'] === 'string' && input['cwd'].length > 0) cwd = input['cwd'] as string;
    } catch { /* invalid JSON — use cwd fallback */ }
    const result = spawnSync(process.execPath, [process.argv[1] ?? '', 'check', '--staged', '--ci'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    if (result.error) process.exit(0); // fail-open per D-05
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const code = result.status ?? 0;
    process.exit(code === 2 ? 2 : 0);
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
    // Idempotency check (D-08)
    const stopGroups = ((settings['hooks'] as Record<string, unknown> | undefined)?.['Stop'] ?? []) as Array<{ hooks?: Array<{ command?: string }> }>;
    const alreadyInstalled = stopGroups.some(g => g.hooks?.some(h => h.command?.includes('proctor stop-hook')));
    if (alreadyInstalled) {
      process.stdout.write('Already installed\n');
      process.exit(0);
    }
    // Merge (D-07)
    const hooks = ((settings['hooks'] ?? {}) as Record<string, unknown>);
    const stop = ((hooks['Stop'] ?? []) as unknown[]);
    stop.push({ hooks: [{ type: 'command', command: 'npx proctor stop-hook' }] });
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
  .description('Run benchmark harness')
  .action(async () => {
    console.error('not implemented yet');
  });

await program.parseAsync(process.argv);
