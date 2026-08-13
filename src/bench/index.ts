// The runBench orchestrator loads the fixed task pool, seeds and selects N tasks, picks the
// runner (mock fixture-replay or a real shell-out agent), scores each selected task twice
// (proctor off, then on, via AgentTask.proctorOn), writes the results CSV, and prints the
// before/after cheat-rate table to stdout.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadTaskPool, selectTasks } from './tasks.js';
import { createFixtureRunner } from './runners/fixture-runner.js';
import { createShellRunner } from './runners/shell-runner.js';
import { AGENT_RUNNERS } from './runners/registry.js';
import { scoreTask, type ScoredRow } from './scorer.js';
import { toCsvRow, CSV_HEADER } from './csv.js';
import { cheatRateTable } from './report.js';
import type { AgentRunner } from './types.js';

export interface RunBenchOptions {
  tasks: number;
  seed: number;
  mock: boolean;
  agent: string;
  outPath?: string;
}

export interface RunBenchResult {
  csv: string;
  rows: ScoredRow[];
  exitCode: number;
}

function pickRunner(agent: string, mock: boolean): AgentRunner {
  if (mock) return createFixtureRunner(agent);
  const entry = AGENT_RUNNERS.find((e) => e.id === agent);
  if (!entry || entry.available === false) {
    throw new Error(
      `agent "${agent}" is not available for a real (non-mock) run, use --mock, or install/configure the ${agent} CLI first`
    );
  }
  return createShellRunner(entry.id, entry.command);
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
  const delayMs = Number(process.env.PROCTOR_BENCH_DELAY_MS ?? '0');
  const pace = async (first: boolean) => {
    if (first || !Number.isFinite(delayMs) || delayMs <= 0) return;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  };

  const rows: ScoredRow[] = [];
  let failedTasks = 0;
  let started = false;
  for (const entry of selectedEntries) {
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
  } else if (opts.outPath && failedTasks > 0) {
    process.stderr.write(
      `proctor: benchmark had ${failedTasks} invalid task${failedTasks === 1 ? '' : 's'}; preserving the existing output file instead of publishing partial evidence\n`
    );
  }

  cheatRateTable(rows, { stream: process.stdout, mock: opts.mock });

  return { csv, rows, exitCode: failedTasks > 0 ? 1 : 0 };
}
