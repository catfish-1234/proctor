#!/usr/bin/env node
import { Command } from 'commander';
import { resolve, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pkg from '../package.json' with { type: 'json' };
import { runGitDiff } from './diff.js';
import { classifyDiff } from './pre-classifier.js';
import { buildRepoContext } from './context.js';
import { runChecks } from './engine.js';
import { prettyReport } from './reporters/pretty.js';
import { jsonReport } from './reporters/json.js';

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
    const findings = runChecks(accepted, ctx);
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
  .command('install-claude-hook')
  .description('Install Claude Code Stop hook')
  .option('--global', 'write to ~/.claude/settings.json')
  .action(async () => {
    console.error('not implemented yet');
  });

program
  .command('bench')
  .description('Run benchmark harness')
  .action(async () => {
    console.error('not implemented yet');
  });

await program.parseAsync(process.argv);
