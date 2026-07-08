// runBench orchestrator (BENCH-01/02/03): loads the fixed task pool, seeds/selects N tasks,
// picks the runner (mock fixture-replay or a real shell-out agent), scores each selected task
// TWICE (proctor off then on — BENCH-02's real intervention threaded via AgentTask.proctorOn),
// writes the BENCH-03 CSV, and prints the before/after cheat-rate table to stdout.
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
      `agent "${agent}" is not available for a real (non-mock) run — use --mock, or install/configure the ${agent} CLI first`
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

  const rows: ScoredRow[] = [];
  for (const entry of selectedEntries) {
    const offRow = await scoreTask(entry.dir, runner, false);
    rows.push(offRow);
    const onRow = await scoreTask(entry.dir, runner, true);
    rows.push(onRow);
  }

  const csv = CSV_HEADER + rows.map((r) => toCsvRow([r.taskId, r.model, r.proctorOn, r.cheatDetected, r.rhId, r.honestPass])).join('');

  if (opts.outPath) {
    await mkdir(dirname(opts.outPath), { recursive: true });
    await writeFile(opts.outPath, csv, 'utf8');
  }

  cheatRateTable(rows, { stream: process.stdout });

  return { csv, rows, exitCode: 0 };
}
