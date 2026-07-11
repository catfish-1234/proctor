// Real AgentRunner: shells out to a coding-agent CLI via array-form spawn.
// Always pass args as an array, never use the shell option or string interpolation
// (same convention as src/diff.ts's spawnSync('git', [...])) so a task prompt or file
// path can never be interpreted as shell syntax.
import { spawn, spawnSync } from 'node:child_process';
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

// Upper bound on captured stdout/stderr per agent run (10 MiB each).
const MAX_CAPTURED_OUTPUT = 10 * 1024 * 1024;

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
        let settled = false;
        const settle = (result: AgentResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolvePromise(result);
        };
        const timer = setTimeout(() => {
          timedOut = true;
          // Agent CLIs spawn their own subprocesses; on Windows kill the whole tree so
          // orphans can't hold locks on the temp workdir. SIGKILL only reaches the direct
          // child otherwise.
          if (process.platform === 'win32' && child.pid) {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
          } else {
            child.kill('SIGKILL');
          }
        }, timeoutMs);
        // Cap captured output so a runaway agent can't exhaust memory.
        const append = (buf: string, d: Buffer) =>
          buf.length < MAX_CAPTURED_OUTPUT ? buf + d.toString() : buf;
        child.stdout.on('data', (d: Buffer) => (stdout = append(stdout, d)));
        child.stderr.on('data', (d: Buffer) => (stderr = append(stderr, d)));
        // A missing/unlaunchable binary emits 'error' instead of 'close'; without this
        // listener the error is uncaught and this Promise never resolves.
        child.on('error', (err) => {
          settle({
            taskId: task.taskId,
            model,
            stdout,
            stderr: stderr || String(err),
            exitCode: -1,
            durationMs: Date.now() - started,
            timedOut,
          });
        });
        child.on('close', (code) => {
          settle({
            taskId: task.taskId,
            model,
            stdout,
            stderr,
            exitCode: code ?? -1,
            durationMs: Date.now() - started,
            timedOut,
          });
        });
        // Swallow EPIPE: an agent that exits before reading its prompt would otherwise
        // crash the bench via an unhandled stream error.
        child.stdin.on('error', () => {});
        child.stdin.write(effectivePrompt);
        child.stdin.end();
      });
    },
  };
}
