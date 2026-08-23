#!/usr/bin/env node
/**
 * Tells you what `proctor setup` would write, and stops there.
 *
 * proctor's whole claim is that it is the thing you trust to watch an agent. A package that
 * silently rewrites your git hooks and drops ruleset files into your repository during
 * `npm install` spends exactly the credibility the tool is selling, and "an npm package modified
 * my git hooks" is a reasonable thing to be angry about even when the hooks are good ones. So the
 * default is a notice: here is precisely what would be written, here is the one command that
 * writes it.
 *
 * `PROCTOR_AUTO_SETUP=1` restores the old install-and-wire behavior for people who want it,
 * with every skip guard below still in force.
 *
 * A postinstall script has to be conservative about when it speaks at all, so this stays quiet in
 * every context where the notice would be noise (CI, global installs, transitive deps, npx), and
 * it never fails an install: a guard that breaks `npm install` gets uninstalled the same
 * afternoon.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectAgents } from '../adapters/detect.js';

/** Where npm was invoked, which is the project being installed into. */
const projectDir = process.env.INIT_CWD;

/** This package's own root, walked up from the bundled script's location. */
function packageRoot(): string {
  let dir = fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

/**
 * Why this run should say nothing, or undefined to proceed.
 *
 * Each of these is a context where neither the notice nor an opt-in auto-setup makes sense: there
 * is no project to wire up, or the checkout is disposable, or the person running npm never asked
 * about proctor at all.
 */
function skipReason(root: string): string | undefined {
  if (process.env.PROCTOR_NO_POSTINSTALL) return 'PROCTOR_NO_POSTINSTALL is set';
  if (process.env.CI) return 'running in CI, where the checkout is disposable';
  if (process.env.npm_config_global === 'true') return 'this is a global install, with no project to set up';
  if (!projectDir) return 'INIT_CWD is not set, so the target project is unknown';

  const target = resolve(projectDir);
  // Installing proctor's own dependencies. Setup here would rewrite the source of truth from the
  // build output, which is backwards.
  if (target === resolve(root)) return 'this is proctor’s own repository';
  // A transitive install: npm ran inside a dependency's directory, not a real project.
  if (target.split(/[\\/]/).includes('node_modules')) return 'installed as a transitive dependency';
  // `npx proctor …` unpacks into a cache directory and runs from there. There is no project to
  // wire up, and the CLI the user actually asked for is about to run anyway.
  if (target.includes('_npx') || target.includes('.npm/_cacache')) return 'running via npx, not installing into a project';
  if (!existsSync(join(target, '.git'))) return 'no git repository here, so there is no commit to guard';

  return undefined;
}

/**
 * The notice. Every path named here is a path `proctor setup` would actually write, resolved
 * against this repository rather than described in the abstract, because "writes ruleset files
 * for your agents" is not something a reader can audit and a list of four paths is.
 */
async function printNotice(target: string): Promise<void> {
  let agentPaths: string[] = [];
  try {
    agentPaths = (await detectAgents(target)).map(a => a.relativePath);
  } catch {
    // Detection is a convenience here, not the point. If it throws, the notice still tells the
    // reader what setup does and which command runs it.
  }

  const lines = [
    '',
    'proctor is installed. It has written nothing to your repository.',
    '',
    '  npx proctor setup',
    '',
    'That one command would write, and nothing else:',
    agentPaths.length > 0
      ? `  - the honest-completion ruleset to ${agentPaths.length} agent path${agentPaths.length === 1 ? '' : 's'}: ${agentPaths.join(', ')}`
      : '  - the honest-completion ruleset to the agent paths this repo already uses (AGENTS.md if none are detected)',
    '  - a git pre-commit hook at .git/hooks/pre-commit (an existing hook is never overwritten)',
    '  - a Claude Code Stop hook in .claude/settings.json, only if this repo uses Claude Code',
    '',
    'Nothing outside your repository is touched, and no network call is made.',
    'Run `npx proctor check` first if you want to see what it finds before wiring anything up.',
    'Set PROCTOR_AUTO_SETUP=1 to have future installs run setup for you.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

async function main(): Promise<void> {
  const root = packageRoot();
  const reason = skipReason(root);
  if (reason) {
    // Deliberately quiet. Nothing was going to be written either way, so in a transitive install
    // or a CI checkout this line would be pure noise on somebody else's build log.
    if (process.env.PROCTOR_DEBUG) {
      process.stdout.write(`proctor: postinstall did nothing (${reason}).\n`);
    }
    return;
  }

  const target = projectDir as string;

  if (!process.env.PROCTOR_AUTO_SETUP) {
    await printNotice(target);
    return;
  }

  const cli = join(root, 'dist', 'cli.js');
  if (!existsSync(cli)) {
    process.stdout.write('proctor: build output not found, skipping automatic setup. Run `npx proctor setup`.\n');
    return;
  }

  const result = spawnSync(process.execPath, [cli, 'setup'], {
    cwd: target,
    stdio: 'inherit',
  });

  // Deliberately not propagated to the exit code. Setup partially failing is worth saying out
  // loud, and is never worth failing somebody's `npm install` over.
  if (result.status !== 0) {
    process.stdout.write('proctor: automatic setup did not finish cleanly. Run `npx proctor setup` to see why.\n');
  }
}

main().catch((err: unknown) => {
  // Same reasoning as above, one level out: nothing this script can hit is worth breaking an
  // install for.
  process.stdout.write(`proctor: postinstall notice could not be printed (${String(err)}). Run \`npx proctor setup\` to install the guards.\n`);
});
