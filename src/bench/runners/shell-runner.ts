// Real AgentRunner: shells out to a coding-agent CLI via array-form spawn.
// Always pass args as an array, never use the shell option or string interpolation
// (same convention as src/diff.ts's spawnSync('git', [...])) so a task prompt or file
// path can never be interpreted as shell syntax.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRunner, AgentTask, AgentResult } from '../types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// A fixed relative __dirname offset breaks once tsup bundles this module into a single
// dist/cli.js — the directory depth collapses from src/bench/runners/ to dist/, shifting
// the effective offset by one level (mirrors the DEFAULT_TASKS_DIR fix in ../tasks.ts).
// Walk up from __dirname looking for package.json instead, which is depth-independent
// whether running from source (vitest) or the bundled CLI.
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

const SKILL_MD_PATH = join(findPackageRoot(__dirname), 'src/skill/SKILL.md');

/**
 * Builds the effective prompt sent to the agent. When task.proctorOn is true, prepends the
 * canonical honest-completion ruleset (src/skill/SKILL.md) as a leading preamble ahead of the
 * task prompt. When false, the bare task prompt is used unchanged.
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
