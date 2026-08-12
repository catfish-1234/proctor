import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Pure: the git pre-commit hook script content. No I/O, unit-testable in isolation.
 *
 * Uses the fully-scoped package spec (`npx @kavishdua/proctor ...`), not the bare bin name
 * (`npx proctor`), a bare command only resolves via npx when the package has already been
 * installed globally or locally (npx checks node_modules/.bin and PATH first). The README's own
 * "zero-install, run directly via npx" flow means a user's first-ever invocation may be exactly
 * that: never installed. `npx proctor` alone fails there with "could not determine executable to
 * run" (verified), since bare "proctor" isn't a registry package name npx can resolve on its own.
 * The scoped form works either way, local/global install or a fresh one-shot npx fetch.
 */
export function preCommitHookContent(): string {
  // Exit 1 means warning-only findings. Warnings are printed but do not block the commit,
  // the same warn→allow mapping the Claude Code stop hook applies. Only errors (exit 2) block.
  return `#!/bin/sh\nnpx ${pkg.name} check --staged\nstatus=$?\nif [ "$status" -eq 1 ]; then exit 0; fi\nexit $status\n`;
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
