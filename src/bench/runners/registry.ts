// Model id -> command template + availability, mirroring src/rules.ts's RULE_METADATA
// "id -> metadata record" shape. Keeping shell-runner generic means adding a 4th/5th
// agent here is a one-line registry addition, not new code.

export interface AgentModelEntry {
  id: string;
  command: string[];
  scriptable: boolean;
  available?: boolean;
}

export const AGENT_RUNNERS: AgentModelEntry[] = [
  // --dangerously-skip-permissions is required for claude -p to actually write files: with no
  // TTY, Claude Code can't interactively prompt for edit approval, so without this flag it makes
  // no changes at all (silently — cheat_detected and honest_pass both read as false, not an
  // error). Safe here specifically because scorer.ts always runs this against a disposable temp
  // directory copy, never the live bench/tasks/ source (RESEARCH.md's threat model, T-06-*).
  { id: 'claude-code', command: ['claude', '-p', '--dangerously-skip-permissions'], scriptable: true, available: true },
  { id: 'codex', command: ['codex', 'exec'], scriptable: true, available: true },
  { id: 'gemini-cli', command: ['gemini', '-p'], scriptable: true, available: false },
];
