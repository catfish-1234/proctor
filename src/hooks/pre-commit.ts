import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Pure: the git pre-commit hook script content. No I/O, unit-testable in isolation.
 *
 * Three things this script has to get right, in order of how badly each one bites.
 *
 * **It fails closed.** The first version ran `npx @kavishdua/proctor check --staged` and mapped
 * exit 1 to "allow", because exit 1 is proctor's warning-only code. But npx also exits 1 when it
 * cannot resolve the package at all: offline, registry down, private registry not configured, name
 * not published yet. A guard that cannot run then looked exactly like a guard that ran and found
 * nothing, and the commit landed unchecked. That is the worst failure mode a tool like this can
 * have, because it is silent and it is the one an agent would find first. So the hook now probes
 * with `--version` before trusting any exit code, and blocks when proctor could not run.
 *
 * **It prefers a local install.** A commit should not depend on the network. node_modules/.bin
 * first, then a global proctor on PATH, and only then npx as the last resort.
 *
 * **It still uses the fully-scoped package spec for the npx path.** A bare `npx proctor` only
 * resolves when the package is already installed, since "proctor" is not a registry name npx can
 * fetch on its own; the scoped form works either way.
 */
export function preCommitHookContent(): string {
  // Exit 1 means warning-only findings. Warnings are printed but do not block the commit,
  // the same warn→allow mapping the Claude Code stop hook applies. Only errors (exit 2) block.
  return [
    '#!/bin/sh',
    '# Installed by proctor. Prefers a local install so a commit does not depend on the network.',
    'if [ -x "./node_modules/.bin/proctor" ]; then',
    '  proctor_run() { ./node_modules/.bin/proctor "$@"; }',
    'elif command -v proctor >/dev/null 2>&1; then',
    '  proctor_run() { command proctor "$@"; }',
    'else',
    `  proctor_run() { npx --yes ${pkg.name} "$@"; }`,
    'fi',
    '',
    '# Fail closed: "could not run" and "ran and found nothing" are indistinguishable from an exit',
    '# code alone, and treating the first as the second is how a guard quietly stops guarding.',
    'if ! proctor_run --version >/dev/null 2>&1; then',
    '  echo "proctor: could not run, so this commit was NOT checked. Blocking." >&2',
    `  echo "proctor: install it with 'npm install --save-dev ${pkg.name}', or bypass deliberately with 'git commit --no-verify'." >&2`,
    '  exit 1',
    'fi',
    '',
    'proctor_run check --staged',
    'status=$?',
    'if [ "$status" -eq 1 ]; then exit 0; fi',
    'exit $status',
    '',
  ].join('\n');
}

async function hasHusky(cwd: string): Promise<boolean> {
  try {
    const pkgJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as Record<string, unknown>;
    return 'husky' in ((pkgJson['devDependencies'] ?? {}) as Record<string, unknown>);
  } catch {
    return false; // ENOENT or parse failure
  }
}

/**
 * If a pre-commit hook already exists at hookPath and isn't ours, copy it to
 * `<hookPath>.bak` before overwriting so the user's prior hook isn't silently lost.
 */
async function backupForeignHook(hookPath: string): Promise<void> {
  let existing: string;
  try {
    existing = await readFile(hookPath, 'utf8');
  } catch {
    return; // no existing hook
  }
  if (existing.includes('proctor')) return; // already ours (any version), safe to overwrite
  await writeFile(hookPath + '.bak', existing, 'utf8');
  process.stderr.write(`proctor: existing pre-commit hook backed up to ${hookPath}.bak, merge it manually if you still need it\n`);
}

/**
 * Installs the git pre-commit hook. Detects husky and writes to .husky/pre-commit when present,
 * otherwise falls back to .git/hooks/pre-commit directly. Returns the path the hook was
 * written to.
 */
export async function installPreCommitHook(cwd: string): Promise<string> {
  const hookContent = preCommitHookContent();

  if (await hasHusky(cwd)) {
    const hookPath = join(cwd, '.husky', 'pre-commit');
    await mkdir(join(cwd, '.husky'), { recursive: true });
    await backupForeignHook(hookPath);
    await writeFile(hookPath, hookContent, 'utf8');
    spawnSync('git', ['add', '--chmod=+x', hookPath], { cwd });
    return hookPath;
  }

  // Without this, `mkdir -p .git/hooks` below happily creates a .git directory in a plain folder,
  // leaving behind something that looks like a repository, contains a hook nothing will ever run,
  // and reports success.
  const insideRepo = spawnSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf8' });
  if (insideRepo.status !== 0) {
    throw new Error('not a git repository, so there is no pre-commit hook to install');
  }

  const hookPath = join(cwd, '.git', 'hooks', 'pre-commit');
  await mkdir(join(cwd, '.git', 'hooks'), { recursive: true });
  await backupForeignHook(hookPath);
  await writeFile(hookPath, hookContent, 'utf8');
  try { chmodSync(hookPath, 0o755); } catch { /* Windows, acceptable */ }
  return hookPath;
}

/**
 * Removes the pre-commit hook, but only when it is proctor's. A hook someone else installed, or
 * one a user has edited to do more than call proctor, is left alone: uninstalling one tool must
 * never quietly disarm another. Returns the path removed, or undefined when there was nothing of
 * proctor's to remove.
 *
 * The comparison normalizes line endings and ignores blank lines. `.husky/pre-commit` is a
 * committed file, so a Windows clone with the default `core.autocrlf=true` checks it out as CRLF;
 * a byte-exact match would then report "proctor is not installed" while leaving a live hook in
 * place, which is worse than not offering to remove it at all. The match is still whole-file, so a
 * hook a user has extended with their own commands is not proctor's and stays.
 */
export async function removePreCommitHook(cwd: string, dryRun: boolean): Promise<string | undefined> {
  const normalize = (s: string): string =>
    s.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd()).filter(Boolean).join('\n');
  const ours = normalize(preCommitHookContent());

  for (const hookPath of [join(cwd, '.husky', 'pre-commit'), join(cwd, '.git', 'hooks', 'pre-commit')]) {
    let existing: string;
    try {
      existing = await readFile(hookPath, 'utf8');
    } catch {
      continue;
    }
    if (normalize(existing) !== ours) continue;
    if (!dryRun) await rm(hookPath, { force: true });
    return hookPath;
  }
  return undefined;
}
