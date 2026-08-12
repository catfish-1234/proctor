import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { AGENT_ADAPTERS, type AgentAdapter } from './registry.js';
import { upsertBlock, extractBlock, removeBlock } from './block.js';
import { recordWritten, MANIFEST_FILENAME } from './manifest.js';
import { removePreCommitHook } from '../hooks/pre-commit.js';
import { removeStopHook } from '../hooks/claude-settings.js';

/**
 * Writing the canonical ruleset out to agent paths, and taking it back off again.
 *
 * The two directions are here together on purpose: every rule about what install may touch (a
 * shared file is merged, never overwritten) has a matching rule about what uninstall may take back
 * (only the managed block, never the user's own content), and they are easy to get out of step if
 * they live apart.
 */

/**
 * Writes the ruleset to each given adapter path. Returns how many could not be written.
 *
 * `canonical` is passed in rather than read here: the ruleset is resolved relative to the
 * entrypoint, and tsup bundles every module into one `dist/cli.js`, so `import.meta.url` in this
 * file would point somewhere different in a build than it does in source.
 *
 * Progress goes to stdout as it happens rather than being returned, because a partial install is
 * worth seeing as it unfolds: the interesting case is the one that stops halfway.
 */
export async function deploySkill(cwd: string, adapters: AgentAdapter[], canonical: string): Promise<number> {
  let failed = 0;

  for (const adapter of adapters) {
    const dest = join(cwd, adapter.relativePath);
    const content = adapter.transform ? adapter.transform(canonical) : canonical;

    // One unwritable path must not abort the other adapters. A repo where some tool already
    // uses one of these names as a directory, or where a path is read-only, is a normal thing
    // to run into, and the remaining agents should still get the ruleset.
    try {
      // Shared paths hold user-authored content too, so proctor merges into a delimited block
      // and leaves the rest of the file alone rather than overwriting it.
      if (adapter.shared) {
        let existing: string | undefined;
        try {
          existing = await readFile(dest, 'utf8');
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, upsertBlock(existing, content), 'utf8');
        // Record that proctor wrote a block here, so drift-check can tell a block that was
        // deleted after install apart from a file proctor never touched.
        await recordWritten(cwd, adapter.id);
        process.stdout.write((existing === undefined ? 'Installed: ' : 'Merged: ') + dest + '\n');
        continue;
      }

      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content, 'utf8');
      process.stdout.write('Installed: ' + dest + '\n');
    } catch (err: unknown) {
      failed++;
      const code = (err as NodeJS.ErrnoException).code ?? 'unknown error';
      process.stderr.write(`proctor: skipped ${adapter.displayName} at ${dest} (${code})\n`);
    }
  }
  return failed;
}

/**
 * Undoes an install, and touches nothing else.
 *
 * Shared files hold the user's own content, so only proctor's managed block comes out and the file
 * stays; a file left holding nothing but whitespace is removed rather than kept as an empty husk.
 * proctor-owned files are deleted outright. The pre-commit hook and the Stop hook entry are only
 * removed when they are proctor's: uninstalling one tool must never quietly disarm another.
 *
 * Returns one human-readable line per item, relative to the repo root.
 */
export async function uninstallProctor(cwd: string, dryRun: boolean): Promise<string[]> {
  const done: string[] = [];
  const rel = (p: string): string => relative(cwd, p).replace(/\\/g, '/');

  for (const adapter of AGENT_ADAPTERS) {
    const dest = join(cwd, adapter.relativePath);
    let existing: string;
    try {
      existing = await readFile(dest, 'utf8');
    } catch {
      continue;
    }

    if (adapter.shared) {
      if (extractBlock(existing) === undefined) continue;
      const stripped = removeBlock(existing);
      if (stripped.trim() === '') {
        if (!dryRun) await rm(dest, { force: true });
        done.push(`Removed: ${adapter.relativePath}`);
      } else {
        if (!dryRun) await writeFile(dest, stripped, 'utf8');
        done.push(`Unmerged the proctor block from: ${adapter.relativePath}`);
      }
      continue;
    }

    if (!dryRun) await rm(dest, { force: true });
    done.push(`Removed: ${adapter.relativePath}`);
  }

  const manifest = join(cwd, MANIFEST_FILENAME);
  try {
    await readFile(manifest, 'utf8');
    if (!dryRun) await rm(manifest, { force: true });
    done.push(`Removed: ${MANIFEST_FILENAME}`);
  } catch { /* never installed a shared adapter here */ }

  const hookPath = await removePreCommitHook(cwd, dryRun);
  if (hookPath) done.push(`Removed: ${rel(hookPath)}`);

  const stop = await removeStopHook(join(cwd, '.claude'), dryRun);
  if (stop) done.push(`Removed the proctor Stop hook from: ${rel(stop)}`);

  return done;
}
