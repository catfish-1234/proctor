// The runBench orchestrator loads the fixed task pool, seeds and selects N tasks, picks the
// runner (mock fixture-replay or a real shell-out agent), scores each selected task twice
// (proctor off, then on, via AgentTask.proctorOn), writes the results CSV, and prints the
// before/after cheat-rate table to stdout.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadTaskPool, selectTasks } from './tasks.js';
import { createFixtureRunner } from './runners/fixture-runner.js';
import { createShellRunner } from './runners/shell-runner.js';
import { AGENT_RUNNERS } from './runners/registry.js';
import { scoreTask, type ScoredRow } from './scorer.js';
import { toCsvRow, CSV_HEADER, parseCsvRows } from './csv.js';
import { cheatRateTable } from './report.js';
import type { AgentRunner } from './types.js';

export interface RunBenchOptions {
  tasks: number;
  seed: number;
  mock: boolean;
  agent: string;
  outPath?: string;
  /** Carry completed tasks over from a previous attempt's `.partial.csv` instead of re-running them. */
  resume?: boolean;
}

export interface RunBenchResult {
  csv: string;
  rows: ScoredRow[];
  exitCode: number;
}

/**
 * A millisecond harness knob read from the environment, or `fallback` when it is unset or junk.
 *
 * Both knobs below tune the environment a live run happens in, not the experiment: neither changes
 * what is measured or how a row is scored. Junk is ignored rather than rejected, because the worst
 * outcome for a benchmark is a knob that silently reads as zero. `PROCTOR_BENCH_TIMEOUT_MS=abc`
 * giving every task a 0ms budget would fail all 22 and look exactly like an agent that never ran.
 */
export function benchEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    process.stderr.write(`proctor: ignoring ${name}=${raw}, expected a non-negative number of milliseconds\n`);
    return fallback;
  }
  return parsed;
}

/**
 * How long a single agent invocation may run before the harness kills it.
 *
 * The 120s default suits tasks 1 through 15, which are single-line fixes. Tasks 16 through 22 were
 * built to need real work (banker's rounding, semver prerelease ordering, grapheme clusters), and
 * task-16 hits the default limit. Because a timed-out task now voids the whole run's CSV rather
 * than publishing a partial one, one slow task is enough to leave a live run with no result at all.
 * Raising this is the prerequisite for a number on the hard tier, so it is a knob rather than a
 * new constant: the right budget depends on the agent, not on the corpus.
 */
const DEFAULT_AGENT_TIMEOUT_MS = 120_000;

/**
 * Where a partial run's surviving rows go: alongside the requested output, never over it.
 *
 * The `.csv` suffix is replaced rather than appended so the result reads as one name and not as
 * `results-live.csv.partial.csv`. Getting this wrong writes real rows to an unexpected path, which
 * is the one way a "this is not a result" file could still be mistaken for one.
 */
export function partialOutPath(outPath: string): string {
  return `${outPath.replace(/\.csv$/i, '')}.partial.csv`;
}

function pickRunner(agent: string, mock: boolean): AgentRunner {
  if (mock) return createFixtureRunner(agent);
  const entry = AGENT_RUNNERS.find((e) => e.id === agent);
  if (!entry || entry.available === false) {
    throw new Error(
      `agent "${agent}" is not available for a real (non-mock) run, use --mock, or install/configure the ${agent} CLI first`
    );
  }
  return createShellRunner(entry.id, entry.command, benchEnvMs('PROCTOR_BENCH_TIMEOUT_MS', DEFAULT_AGENT_TIMEOUT_MS));
}

export async function runBench(opts: RunBenchOptions): Promise<RunBenchResult> {
  const pool = await loadTaskPool();
  const dirNames = pool.map((p) => p.taskId);
  const selectedIds = selectTasks(dirNames, opts.seed, opts.tasks);
  const selectedEntries = selectedIds
    .map((id) => pool.find((p) => p.taskId === id))
    .filter((p): p is (typeof pool)[number] => p !== undefined);

  let runner: AgentRunner;
  try {
    runner = pickRunner(opts.agent, opts.mock);
  } catch (err) {
    process.stderr.write(`proctor: ${String(err instanceof Error ? err.message : err)}\n`);
    return { csv: '', rows: [], exitCode: 2 };
  }

  // Pacing between agent invocations, off by default.
  //
  // A real-agent run is dozens of back-to-back CLI invocations, and a live 22-task run had 37 of
  // its 44 runs come back "exited 1, no changes" while the same tasks passed one or two at a time.
  // That is the harness hitting a rate limit, not the agent being honest, and it is exactly the
  // shape of null result this benchmark must not publish as a behavioural number. An env var
  // rather than a flag because it tunes the environment the harness runs in, not the experiment:
  // the delay changes how long a run takes and nothing about what is measured.
  const delayMs = benchEnvMs('PROCTOR_BENCH_DELAY_MS', 0);
  const pace = async (first: boolean) => {
    if (first || delayMs <= 0) return;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  };

  // Rows carried over from an earlier attempt at this same run.
  //
  // A 22-task live run is 44 agent invocations, which is more than one Claude subscription session
  // window allows: three consecutive attempts reached 16, 14 and 16 tasks before the agent started
  // returning "You've hit your session limit". Resuming is what makes a complete run reachable at
  // all, by spending the remaining tasks against the next window rather than restarting from zero.
  //
  // Only whole tasks are carried, and only for this runner's model. A task counts as done when
  // both its arms are present, matching the pairing rule below: a half-scored task is re-run rather
  // than left unmatched in the denominator.
  const rows: ScoredRow[] = [];
  const resumed = new Map<string, ScoredRow[]>();
  if (opts.resume && opts.outPath) {
    const partialPath = partialOutPath(opts.outPath);
    let text: string | undefined;
    try {
      text = await readFile(partialPath, 'utf8');
    } catch {
      process.stderr.write(`proctor: --resume found no rows to resume from at ${partialPath}, scoring every selected task\n`);
    }
    if (text !== undefined) {
      const prior = parseCsvRows(text).filter(r => r.model === runner.model);
      const byTask = new Map<string, typeof prior>();
      for (const row of prior) byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row]);
      for (const [taskId, taskRows] of byTask) {
        const off = taskRows.find(r => !r.proctorOn);
        const on = taskRows.find(r => r.proctorOn);
        if (!off || !on) continue;
        resumed.set(taskId, [off, on]);
      }
      process.stderr.write(
        `proctor: resuming from ${partialPath}, carrying ${resumed.size} completed task${resumed.size === 1 ? '' : 's'}\n`
      );
    }
  }

  let failedTasks = 0;
  let started = false;
  for (const entry of selectedEntries) {
    // Carried rows are emitted in selection order alongside freshly scored ones, so a resumed run
    // produces the same CSV as an uninterrupted one rather than one grouped by attempt.
    const carried = resumed.get(entry.taskId);
    if (carried) {
      rows.push(...carried);
      continue;
    }
    // A single broken task (unreadable prompt.md, git failure in its repo) shouldn't abort
    // the run and discard every row already scored, warn, skip, keep going.
    try {
      // Keep the experiment paired. If either arm is invalid, neither belongs in the denominator;
      // an unmatched off/on row biases the before/after rates by construction.
      await pace(!started);
      started = true;
      const offRow = await scoreTask(entry.dir, runner, false);
      await pace(false);
      const onRow = await scoreTask(entry.dir, runner, true);
      rows.push(offRow, onRow);
    } catch (err) {
      failedTasks++;
      process.stderr.write(`proctor: bench task ${entry.taskId} failed, skipping: ${String(err instanceof Error ? err.message : err)}\n`);
    }
  }

  const csv = CSV_HEADER + rows.map((r) => toCsvRow([r.taskId, r.model, r.proctorOn, r.cheatDetected, r.rhId, r.honestPass])).join('');

  if (opts.outPath && failedTasks === 0) {
    await mkdir(dirname(opts.outPath), { recursive: true });
    await writeFile(opts.outPath, csv, 'utf8');
    // The run is complete, so any carry-over file is now superseded. Leaving it would let a later
    // --resume silently carry stale rows into a fresh run.
    await rm(partialOutPath(opts.outPath), { force: true });
  } else if (opts.outPath && failedTasks > 0) {
    // The published CSV stays untouched, which is the point: a partial run is not evidence and
    // must not be quoted as any. But discarding the surviving rows entirely was throwing away the
    // expensive half of the failure. A live 22-task run is 44 agent invocations and can consume a
    // whole session quota, and two consecutive runs cost exactly that and left nothing behind to
    // look at. The rows go to a sibling `.partial.csv` instead: named so it cannot be mistaken for
    // the result, kept so the next attempt starts from something.
    const partialPath = partialOutPath(opts.outPath);
    await mkdir(dirname(partialPath), { recursive: true });
    await writeFile(partialPath, csv, 'utf8');
    process.stderr.write(
      `proctor: benchmark had ${failedTasks} invalid task${failedTasks === 1 ? '' : 's'}; preserving the existing output file instead of publishing partial evidence\n` +
      `proctor: the ${rows.length / 2} task${rows.length === 2 ? '' : 's'} that did complete were written to ${partialPath}, which is not a result\n`
    );
  }

  cheatRateTable(rows, { stream: process.stdout, mock: opts.mock });

  return { csv, rows, exitCode: failedTasks > 0 ? 1 : 0 };
}
