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
  { id: 'claude-code', command: ['claude', '-p'], scriptable: true, available: true },
  { id: 'codex', command: ['codex', 'exec'], scriptable: true, available: true },
  { id: 'gemini-cli', command: ['gemini', '-p'], scriptable: true, available: false },
];
