// Seeded task selector and disk loader for the bench/tasks/task-NN/ pool.
// Task directory names are validated against /^task-\d+$/ before being used in any path
// join, so a crafted task-pool entry name can't be used for path traversal.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Walks up from startDir looking for this package's package.json. A FIXED relative offset
 * (e.g. "two levels up") only holds when this module runs unbundled from its source location
 * (src/bench/tasks.ts). Once tsup bundles everything into a single dist/cli.js, import.meta.url
 * points at dist/ instead, silently breaking a hardcoded "../../bench/tasks" join (it would
 * resolve outside the package entirely). Walking up to find package.json works for both the
 * unbundled (vitest, src/bench/tasks.ts) and bundled (dist/cli.js) cases.
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const DEFAULT_TASKS_DIR = join(findPackageRoot(__dirname), 'bench/tasks');

const TASK_NAME_RE = /^task-\d+$/;

// Small hand-rolled mulberry32-style seeded PRNG so task selection is reproducible across runs
// without adding a dependency.
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Deterministic, OS-independent task selection. Directory listing order isn't guaranteed to be
 * consistent across operating systems, so this sorts dirNames alphabetically first, validates
 * each one, then applies a seeded Fisher-Yates shuffle and takes the first min(n, pool.length).
 */
export function selectTasks(dirNames: string[], seed: number, n: number): string[] {
  const valid = dirNames.filter((name) => TASK_NAME_RE.test(name));
  const sorted = valid.slice().sort();
  const shuffled = seededShuffle(sorted, seed);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

export interface TaskPoolEntry {
  taskId: string;
  dir: string;
  promptPath: string;
  repoDir: string;
  heldOutDir: string;
  heldOutPath: string;
  mockPath: string;
}

/**
 * Reads tasksDir, keeps only task-\d+ dirs (sorted), and resolves their sub-paths.
 * Does NOT read file contents here — path resolution only.
 * Defaults to bench/tasks/ resolved relative to package root via import.meta.url,
 * not process.cwd(), so bench works regardless of invocation cwd.
 */
export async function loadTaskPool(tasksDir: string = DEFAULT_TASKS_DIR): Promise<TaskPoolEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(tasksDir, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const dirNames = entries
    .filter((e) => e.isDirectory() && TASK_NAME_RE.test(e.name))
    .map((e) => e.name)
    .sort();

  return dirNames.map((taskId) => {
    const dir = join(tasksDir, taskId);
    return {
      taskId,
      dir,
      promptPath: join(dir, 'prompt.md'),
      repoDir: join(dir, 'repo'),
      heldOutDir: join(dir, 'held-out'),
      heldOutPath: join(dir, 'held-out.json'),
      mockPath: join(dir, 'mock-agent.json'),
    };
  });
}
