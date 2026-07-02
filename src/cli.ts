#!/usr/bin/env node
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };

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
  .action(async (_path, _options) => {
    console.error('not implemented yet');
    process.exit(0);
  });

program
  .command('install-hook')
  .description('Install git pre-commit hook')
  .action(async () => {
    console.error('not implemented yet');
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
