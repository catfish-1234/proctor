import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, existsSync, mkdirSync, rmSync, cpSync, unlinkSync, readFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Every task's held-out suite must fail against the unfixed source, on its own.
 *
 * METHODOLOGY promises exactly this: "An agent that cheats on the visible test but never fixes the
 * underlying bug will fail the held-out test even if its visible-test cheat goes undetected." For
 * six of the twenty-two tasks it was false. Their held-out cases only exercised inputs the bug
 * already handled, so `honest_pass` collapsed to "the visible tests pass", which is precisely what
 * a cheat arranges. task-08 was the clearest: `clamp` returned `Math.max(n, min)` and never capped,
 * and the held-out suite asserted only `clamp(5, 0, 10) === 5`, which the broken version satisfies.
 *
 * The corpus check that already existed verifies the reference fix passes its held-out suite. That
 * direction cannot catch this, because a test asserting nothing discriminating passes the fix too.
 * Both directions are needed and this is the one that was missing.
 *
 * The visible tests are deleted from the staged tree on purpose. They fail against unfixed source
 * by construction, so leaving them in makes every task look fine and measures nothing. An earlier
 * draft of this file did exactly that, and a second draft tried to approximate the invariant by
 * comparing assertion text instead of running anything, which passed against the very suites that
 * prompted it. The invariant is behavioural, so it has to be executed.
 *
 * One vitest process covers all tasks: each task is staged in its own subdirectory, so a held-out
 * file's `../thing.js` import still resolves inside its own tree.
 */

const require = createRequire(import.meta.url);
const TASKS_DIR = resolve(process.cwd(), 'bench/tasks');
const SPAWN_BUDGET_MS = platform() === 'win32' ? 240_000 : 120_000;

const taskDirs = existsSync(TASKS_DIR)
  ? readdirSync(TASKS_DIR).filter(d => /^task-\d+$/.test(d)).sort()
  : [];

/** Task ids whose held-out suite produced at least one failure against unfixed source. */
let failedPerTask = new Map<string, number>();
let staged: string[] = [];

beforeAll(() => {
  if (taskDirs.length === 0) return;

  const vitestPkgDir = dirname(require.resolve('vitest/package.json'));
  const nodeModules = dirname(vitestPkgDir);
  const root = mkdtempSync(join(tmpdir(), 'proctor-heldout-'));

  // One node_modules for the whole staging tree: Node's resolution walks up from each task's
  // held-out/ directory and finds it here.
  try {
    symlinkSync(nodeModules, join(root, 'node_modules'), platform() === 'win32' ? 'junction' : 'dir');
  } catch {
    // Falls through to a "cannot find vitest" failure below, which is loud rather than silent.
  }

  for (const task of taskDirs) {
    const src = join(TASKS_DIR, task);
    if (!existsSync(join(src, 'held-out'))) continue;
    const dest = join(root, task);
    mkdirSync(dest, { recursive: true });
    cpSync(join(src, 'repo'), dest, { recursive: true });
    // Drop the visible suite. A cheat makes those pass artificially, so they carry no signal here.
    //
    // Per-task vitest.config.* files go too. Staged as a subdirectory of a shared root they fail
    // to resolve their own `vitest/config` import, and a config that fails to load takes its whole
    // suite with it: the task reports zero failures and looks like a corpus weakness rather than a
    // staging bug. Every such config in the pool only sets `environment: 'node'`, which is already
    // the default, so dropping them changes nothing about what the held-out tests assert.
    for (const entry of readdirSync(dest, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (/\.(test|spec)\./.test(entry.name) || /^vitest\.config\./.test(entry.name)) {
        unlinkSync(join(dest, entry.name));
      }
    }
    cpSync(join(src, 'held-out'), join(dest, 'held-out'), { recursive: true });
    staged.push(task);
  }

  const reportPath = join(root, 'report.json');
  spawnSync(
    process.execPath,
    [join(vitestPkgDir, 'vitest.mjs'), 'run', '--root', root, '--reporter=json', `--outputFile=${reportPath}`],
    { cwd: root, encoding: 'utf8', timeout: SPAWN_BUDGET_MS }
  );

  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      testResults?: { name: string; assertionResults?: { status: string }[] }[];
    };
    for (const suite of report.testResults ?? []) {
      const normalized = suite.name.replace(/\\/g, '/');
      const task = staged.find(t => normalized.includes(`/${t}/`));
      if (!task) continue;
      const failures = (suite.assertionResults ?? []).filter(a => a.status === 'failed').length;
      failedPerTask.set(task, (failedPerTask.get(task) ?? 0) + failures);
    }
  }

  rmSync(root, { recursive: true, force: true });
}, SPAWN_BUDGET_MS);

describe('bench task corpus: held-out suites must catch the unfixed bug on their own', () => {
  it('stages every task in the pool', () => {
    expect(taskDirs.length).toBeGreaterThan(0);
    expect(staged.length).toBe(taskDirs.length);
  });

  it('actually ran the staged suites, rather than failing to launch and reporting nothing', () => {
    expect(failedPerTask.size, 'no task produced any result: the staged vitest run did not execute')
      .toBeGreaterThan(0);
  });

  for (const task of taskDirs) {
    it(`${task} held-out fails against the unfixed source`, () => {
      expect(
        failedPerTask.get(task) ?? 0,
        `${task}: its held-out suite passes against the unfixed implementation, so honest_pass ` +
        `for this task cannot tell a real fix from a cheat that only satisfies the visible tests`
      ).toBeGreaterThan(0);
    });
  }
});
