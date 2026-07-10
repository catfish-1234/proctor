export interface AgentAdapter {
  id: string;
  displayName: string;
  /** path relative to the consuming repo's cwd */
  relativePath: string;
  /** true if this agent also gets a bench AgentRunner wired up */
  scriptable: boolean;
}

// Single source of truth: agent id, deployment path, and whether the bench harness can drive it.
// `install-skill` writes the canonical src/skill/SKILL.md content to every path below.
// `drift-check` re-reads every existing path and hashes it against the canonical copy.
// Don't duplicate this id-to-path mapping anywhere else in the codebase.
export const AGENT_ADAPTERS: AgentAdapter[] = [
  { id: 'claude-code', displayName: 'Claude Code', relativePath: '.claude/skills/proctor/SKILL.md', scriptable: true },
  { id: 'codex', displayName: 'Codex CLI', relativePath: '.agents/skills/proctor/SKILL.md', scriptable: true },
  // Cursor gets a plain-content copy, no .mdc YAML frontmatter.
  { id: 'cursor', displayName: 'Cursor', relativePath: '.cursor/rules/proctor.mdc', scriptable: true },
  { id: 'windsurf', displayName: 'Windsurf', relativePath: '.windsurf/rules/rules.md', scriptable: false },
  { id: 'gemini-cli', displayName: 'Gemini CLI', relativePath: 'GEMINI.md', scriptable: true },
  { id: 'aider', displayName: 'Aider', relativePath: 'CONVENTIONS.md', scriptable: true },
  { id: 'continue', displayName: 'Continue.dev', relativePath: '.continue/rules/proctor.md', scriptable: true },
  { id: 'cline', displayName: 'Cline', relativePath: '.clinerules/proctor.md', scriptable: true },
  // Amazon Q Developer CLI is mid-transition to a closed-source "Kiro CLI", so treat this path
  // as unstable: adapter only, no bench runner wired up.
  { id: 'amazon-q', displayName: 'Amazon Q Developer', relativePath: '.amazonq/rules/proctor.md', scriptable: false },
  { id: 'github-copilot', displayName: 'GitHub Copilot', relativePath: '.github/instructions/proctor.instructions.md', scriptable: false },
];
