#!/usr/bin/env node
/**
 * Runs `proctor setup` automatically when the package is installed into a project.
 *
 * The goal is that installing proctor is the whole job: no second command to remember, no
 * "did you also run setup?" step that half of repositories skip and then believe they are guarded
 * when they are not. The Claude Code and Cursor plugins already work this way, since their
 * manifests declare the Stop hook and the host wires it on install. This brings the npm path in
 * line with them.
 *
 * A postinstall script that writes files into somebody's repository has to be conservative about
 * when it runs, so this bails out of every context where the write would be a surprise, and it
 * never fails an install: a guard that breaks `npm install` gets uninstalled the same afternoon.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Why this run should be skipped, or undefined to proceed.
 *
 * Each of these is a context where writing hook files and ruleset files would be wrong rather than
 * merely unnecessary, so the reason is reported instead of being silently swallowed: somebody
 * wondering why setup did not run should be able to find out without reading this file.
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

function main(): void {
  const root = packageRoot();
  const reason = skipReason(root);
  if (reason) {
    process.stdout.write(`proctor: skipping automatic setup (${reason}). Run \`npx proctor setup\` when you want it.\n`);
    return;
  }

  const cli = join(root, 'dist', 'cli.js');
  if (!existsSync(cli)) {
    process.stdout.write('proctor: build output not found, skipping automatic setup. Run `npx proctor setup`.\n');
    return;
  }

  const result = spawnSync(process.execPath, [cli, 'setup'], {
    cwd: projectDir,
    stdio: 'inherit',
  });

  // Deliberately not propagated to the exit code. Setup partially failing is worth saying out
  // loud, and is never worth failing somebody's `npm install` over.
  if (result.status !== 0) {
    process.stdout.write('proctor: automatic setup did not finish cleanly. Run `npx proctor setup` to see why.\n');
  }
}

try {
  main();
} catch (err) {
  // Same reasoning as above, one level out: nothing this script can hit is worth breaking an
  // install for.
  process.stdout.write(`proctor: automatic setup was skipped (${String(err)}). Run \`npx proctor setup\`.\n`);
}
