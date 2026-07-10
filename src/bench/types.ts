// AgentTask/AgentResult/AgentRunner contracts, built for a pluggable AgentRunner interface.
// Plain, flat, no-method data interfaces plus one single-method behavior interface,
// mirroring src/types.ts's Finding/Context split.

export interface AgentTask {
  taskId: string;
  prompt: string;
  workdir: string;
  proctorOn: boolean; // lets a runner change agent behavior between the on and off bench runs
}

export interface AgentResult {
  taskId: string;
  model: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

export interface AgentRunner {
  readonly model: string;
  run(task: AgentTask): Promise<AgentResult>;
}

// Shape of a task's recorded mock-agent.json — read by the fixture runner (Task 3).
// Each `files` map: repo-relative path -> full new file content the mock agent "produces".
export interface MockAgentFile {
  proctorOn: { files: Record<string, string> };
  proctorOff: { files: Record<string, string> };
}
