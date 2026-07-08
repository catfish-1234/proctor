// Real AgentRunner: shells out to a coding-agent CLI via array-form spawn.
// CRITICAL: uses args array form only — no shell option, no string interpolation
// (T-06-03; mirrors src/diff.ts's spawnSync('git', [...]) convention).
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRunner, AgentTask, AgentResult } from '../types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// src/bench/runners/shell-runner.ts -> package root is three levels up
const SKILL_MD_PATH = join(__dirname, '../../skill/SKILL.md');

/**
 * Builds the effective prompt sent to the agent. When task.proctorOn is true, prepends
 * the canonical honest-completion ruleset (src/skill/SKILL.md) as a leading preamble
 * ahead of the task prompt (BENCH-02 real intervention — Blocker-1 fix). When false,
 * the bare task prompt is used unchanged.
 */
async function buildEffectivePrompt(task: AgentTask): Promise<string> {
  if (!task.proctorOn) return task.prompt;
  const skillContent = await readFile(SKILL_MD_PATH, 'utf8');
  return `${skillContent}\n---\n${task.prompt}`;
}

export function createShellRunner(model: string, command: string[], timeoutMs = 120_000): AgentRunner {
  return {
    model,
    async run(task: AgentTask): Promise<AgentResult> {
      const started = Date.now();
      const effectivePrompt = await buildEffectivePrompt(task);
      return new Promise((resolvePromise) => {
        const [cmd, ...rest] = command;
        const child = spawn(cmd as string, rest, {
          cwd: task.workdir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
        child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
        child.on('close', (code) => {
          clearTimeout(timer);
          resolvePromise({
            taskId: task.taskId,
            model,
            stdout,
            stderr,
            exitCode: code ?? -1,
            durationMs: Date.now() - started,
            timedOut,
          });
        });
        child.stdin.write(effectivePrompt);
        child.stdin.end();
      });
    },
  };
}
