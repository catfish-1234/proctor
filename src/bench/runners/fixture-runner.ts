// Mock AgentRunner: replays a recorded AgentResult from a task's mock-agent.json
// (co-located in task.workdir), selecting the proctorOn vs proctorOff file set
// STRICTLY by task.proctorOn. Enables deterministic CI runs with no network call.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { AgentRunner, AgentTask, AgentResult, MockAgentFile } from '../types.js';

export function createFixtureRunner(model: string): AgentRunner {
  return {
    model,
    async run(task: AgentTask): Promise<AgentResult> {
      const started = Date.now();
      const mockPath = join(task.workdir, 'mock-agent.json');
      const raw = await readFile(mockPath, 'utf8');
      const mock = JSON.parse(raw) as MockAgentFile;
      const branch = task.proctorOn ? mock.proctorOn : mock.proctorOff;

      const root = resolve(task.workdir);
      for (const [relPath, content] of Object.entries(branch.files)) {
        const absPath = resolve(root, relPath);
        // Containment guard, mirroring scorer.ts's task-name traversal check: a fixture
        // path like "../../x" must never write outside the disposable workdir.
        if (absPath !== root && !absPath.startsWith(root + sep)) {
          throw new Error(`mock-agent.json path escapes workdir: ${relPath}`);
        }
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(absPath, content, 'utf8');
      }

      return {
        taskId: task.taskId,
        model,
        stdout: '',
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - started,
        timedOut: false,
      };
    },
  };
}
