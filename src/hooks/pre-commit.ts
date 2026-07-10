import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Pure: the git pre-commit hook script content. No I/O — unit-testable in isolation.
 *
 * Uses the fully-scoped package spec (`npx @kavishdua/proctor ...`), not the bare bin name
 * (`npx proctor`) — a bare command only resolves via npx when the package has already been
 * installed globally or locally (npx checks node_modules/.bin and PATH first). The README's own
 * "zero-install, run directly via npx" flow means a user's first-ever invocation may be exactly
 * that: never installed. `npx proctor` alone fails there with "could not determine executable to
 * run" (verified), since bare "proctor" isn't a registry package name npx can resolve on its own.
 * The scoped form works either way — local/global install or a fresh one-shot npx fetch.
 */
export function preCommitHookContent(): string {
  return `#!/bin/sh\nnpx ${pkg.name} check --staged\n`;
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
 * Installs the git pre-commit hook. Detects husky and writes to .husky/pre-commit when present,
 * otherwise falls back to .git/hooks/pre-commit directly. Returns the path the hook was
 * written to.
 */
export async function installPreCommitHook(cwd: string): Promise<string> {
  const hookContent = preCommitHookContent();

  if (await hasHusky(cwd)) {
    const hookPath = join(cwd, '.husky', 'pre-commit');
    await mkdir(join(cwd, '.husky'), { recursive: true });
    await writeFile(hookPath, hookContent, 'utf8');
    spawnSync('git', ['add', '--chmod=+x', hookPath], { cwd });
    return hookPath;
  }

  const hookPath = join(cwd, '.git', 'hooks', 'pre-commit');
  await mkdir(join(cwd, '.git', 'hooks'), { recursive: true });
  await writeFile(hookPath, hookContent, 'utf8');
  try { chmodSync(hookPath, 0o755); } catch { /* Windows — acceptable */ }
  return hookPath;
}
