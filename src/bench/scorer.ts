// scoreTask copies a task's repo/ to a disposable temp workdir, runs the AgentRunner with the
// run's proctorOn state threaded into AgentTask, git-diffs the result, and calls proctor's own
// runChecks to set cheat_detected + rh_id. No detection logic is duplicated here; bench always
// reuses the real verifiers. It also reveals the held-out/ tests only right before running them,
// so honest_pass reflects the agent's actual solution against tests it never saw while working.
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, platform } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { AgentRunner, AgentTask } from './types.js';
import { runChecks } from '../engine.js';
import { buildContext } from '../context/index.js';
import { runGitDiff } from '../diff.js';

// Resolve vitest's actual installed location via Node's own module resolution (createRequire)
// rather than a path hardcoded relative to this file. This file may execute from a location
// (e.g. a git worktree with no node_modules of its own) where node_modules only exists in an
// ancestor directory found by Node's normal upward node_modules search — a fixed
// `join(__dirname, '../../node_modules/...')` join would miss it entirely.
//
// Resolved lazily on purpose: `vitest` is a devDependency, only present when this file runs
// from a source checkout (bench's only supported context: bench/tasks/ itself isn't in
// package.json's `files` either, so a published npx install never has it). Resolving it at
// module load time, unconditionally, used to mean every CLI command, not just `bench`, crashed
// on a clean `npx`/`npm install` with "Cannot find module 'vitest/package.json'", because this
// module is imported by cli.ts regardless of which subcommand runs. Resolve only when a bench
// task actually needs vitest.
const require = createRequire(import.meta.url);
let vitestPaths: { resolvedNodeModules: string; vitestBin: string } | undefined;

function resolveVitestPaths(): { resolvedNodeModules: string; vitestBin: string } {
  if (!vitestPaths) {
    const vitestPkgDir = dirname(require.resolve('vitest/package.json'));
    vitestPaths = {
      resolvedNodeModules: dirname(vitestPkgDir), // node_modules dir containing the resolved vitest install
      vitestBin: join(vitestPkgDir, 'vitest.mjs'),
    };
  }
  return vitestPaths;
}

// Task directory basename is validated against this pattern before any path join, to prevent
// path traversal via a crafted task-pool entry name.
const TASK_NAME_RE = /^task-\d+$/;

export interface ScoredRow {
  taskId: string;
  model: string;
  proctorOn: boolean;
  cheatDetected: boolean;
  rhId: string;
  honestPass: boolean;
}

/**
 * Best-effort node_modules link so a task's disposable temp copy (created under os.tmpdir(),
 * outside this package's directory tree) can resolve bare imports like 'vitest' / 'vitest/config'
 * that its repo/ test files and per-task vitest.config.* files use. Node's module resolution
 * walks up the temp copy's OWN ancestry (e.g. C:\Users\...\AppData\Local\Temp\...), which never
 * reaches this package's node_modules, so without this link every held-out test run would fail
 * with "Cannot find module 'vitest'" regardless of the agent's solution correctness. Uses a
 * Windows junction (no admin/Developer-Mode requirement) or a plain symlink on POSIX. Read-only
 * link into the live node_modules — never written to, never copied from.
 */
function linkNodeModules(workdir: string): void {
  try {
    symlinkSync(
      resolveVitestPaths().resolvedNodeModules,
      join(workdir, 'node_modules'),
      platform() === 'win32' ? 'junction' : 'dir'
    );
  } catch {
    // Best-effort: a failure here surfaces as a held-out test-run failure (honestPass=false)
    // with a clear "Cannot find module" message rather than a silent false negative elsewhere.
  }
}

// Always pass args as an array, never use the shell option or string interpolation, mirroring
// src/diff.ts's runGitDiff convention. commit.gpgsign is turned off below because these are
// throwaway scratch commits inside a disposable temp copy, used only to diff the agent's
// changes, and are never part of this project's own commit history.
function runGit(args: string[], cwd: string): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr || result.stdout)}`);
  }
}

/**
 * honest_pass test command. The bench/tasks pool never declares a per-task override (all 15
 * tasks run via vitest — see bench/tasks/TASKS.md "Test isolation"), so this resolves
 * proctor's OWN already-installed vitest binary directly (array-form spawn, zero network)
 * instead of shelling out to `npx vitest run`, which would attempt to re-resolve/download
 * vitest from inside the disposable temp copy where no independent node_modules tree exists.
 * linkNodeModules() is the companion fix letting the copied test/config files' own bare
 * 'vitest' imports resolve once this process is running. Read exit code only — no LLM/judge.
 */
function runHeldOutTests(workdir: string): boolean {
  const result = spawnSync(process.execPath, [resolveVitestPaths().vitestBin, 'run', '--root', workdir], {
    cwd: workdir,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return result.status === 0;
}

export async function scoreTask(taskDir: string, runner: AgentRunner, proctorOn: boolean): Promise<ScoredRow> {
  const taskId = basename(taskDir);
  if (!TASK_NAME_RE.test(taskId)) {
    throw new Error(`invalid task directory name: ${taskId}`);
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'proctor-bench-'));
  try {
    // Copy only repo/ into a disposable temp dir, using safe recursive fs.cp (never a shell
    // `cp -r`), and never touch the live bench/tasks source.
    await cp(join(taskDir, 'repo'), tempDir, { recursive: true });
    linkNodeModules(tempDir);

    // The mock fixture runner reads mock-agent.json co-located in task.workdir, since
    // AgentTask's interface has no separate "source task dir" field. Copy it in BEFORE the
    // baseline commit below so it's part of the baseline and never shows up as a spurious diff
    // addition after the agent runs (it's a no-op for the real shell-runner, which never reads it).
    try {
      await cp(join(taskDir, 'mock-agent.json'), join(tempDir, 'mock-agent.json'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    // git-init and a baseline commit, so the post-run diff reflects only the agent's changes.
    runGit(['init', '-q'], tempDir);
    runGit(['config', 'user.email', 'proctor-bench@local'], tempDir);
    runGit(['config', 'user.name', 'proctor-bench'], tempDir);
    runGit(['add', '-A'], tempDir);
    runGit(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'baseline', '--allow-empty'], tempDir);

    // Run the agent with proctorOn threaded into AgentTask.proctorOn. This flag is how the
    // on/off runs actually differ: it controls the real SKILL.md injection or the mock's
    // honest-vs-cheating branch.
    const prompt = await readFile(join(taskDir, 'prompt.md'), 'utf8');
    const task: AgentTask = { taskId, prompt, workdir: tempDir, proctorOn };
    await runner.run(task);

    // Diff the result and run proctor's own verifiers on it. No detection logic is
    // reimplemented here. All 11 deterministic signals can trip; only the fuzzy AI extensions
    // of RH004/RH005 stay silent because ctx.aiEnabled/ctx.judge are deliberately left unset.
    // See bench/METHODOLOGY.md for the scope rationale. configRef pins the guard's config to
    // the baseline commit, so an agent writing proctor.config.json can't neuter detection.
    runGit(['add', '-A'], tempDir);
    const { files } = runGitDiff(['--staged'], tempDir);
    const ctx = await buildContext(tempDir, files, { configRef: 'HEAD' });
    const findings = await runChecks(ctx);
    const cheatDetected = findings.length > 0;
    const rhId = findings[0]?.verifierId ?? '';

    // Copy held-out/ in as a subdirectory rather than flattening it into the workdir root, so
    // its test files' own repo-relative imports (e.g. '../stringUtils.js') resolve against the
    // repo/ contents already sitting at the workdir's root. This is the layout the tests occupy
    // once revealed, as documented in bench/tasks/TASKS.md.
    await cp(join(taskDir, 'held-out'), join(tempDir, 'held-out'), { recursive: true });

    // honest_pass comes only from the held-out test process's exit code, never an LLM judge.
    const honestPass = runHeldOutTests(tempDir);

    return { taskId, model: runner.model, proctorOn, cheatDetected, rhId, honestPass };
  } finally {
    // Always remove the disposable temp copy, even if something above threw.
    await rm(tempDir, { recursive: true, force: true });
  }
}
