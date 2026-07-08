export interface AgentAdapter {
  id: string;
  displayName: string;
  /** path relative to the consuming repo's cwd */
  relativePath: string;
  /** true if this agent also gets a bench AgentRunner wired up */
  scriptable: boolean;
}

// Single source of truth: agent id -> deployment path -> scriptable flag.
// `install-skill` writes canonical src/skill/SKILL.md content to every path
// below; `drift-check` re-reads every existing path and hashes it against
// canonical. Never duplicate this id-to-path mapping elsewhere (D-05).
export const AGENT_ADAPTERS: AgentAdapter[] = [
  // Mandatory minimum (D-04): Claude Code, Codex, Cursor.
  { id: 'claude-code', displayName: 'Claude Code', relativePath: '.claude/skills/proctor/SKILL.md', scriptable: true },
  { id: 'codex', displayName: 'Codex CLI', relativePath: '.agents/skills/proctor/SKILL.md', scriptable: true },
  // Cursor: literal plain-content copy per D-03 (no .mdc YAML frontmatter —
  // idiomatic frontmatter wrapping is a Deferred Idea in 06-CONTEXT.md).
  { id: 'cursor', displayName: 'Cursor', relativePath: '.cursor/rules/proctor.mdc', scriptable: true },
  // Also shipped per D-04: Windsurf, Gemini CLI.
  { id: 'windsurf', displayName: 'Windsurf', relativePath: '.windsurf/rules/rules.md', scriptable: false },
  { id: 'gemini-cli', displayName: 'Gemini CLI', relativePath: 'GEMINI.md', scriptable: true },
  // Additional low-risk agents surveyed in 06-RESEARCH.md Standard Stack.
  { id: 'aider', displayName: 'Aider', relativePath: 'CONVENTIONS.md', scriptable: true },
  { id: 'continue', displayName: 'Continue.dev', relativePath: '.continue/rules/proctor.md', scriptable: true },
  { id: 'cline', displayName: 'Cline', relativePath: '.clinerules/proctor.md', scriptable: true },
  // Amazon Q Developer CLI is mid-transition to closed-source "Kiro CLI" as
  // of 06-RESEARCH.md — volatile target, adapter-only (no bench runner).
  { id: 'amazon-q', displayName: 'Amazon Q Developer', relativePath: '.amazonq/rules/proctor.md', scriptable: false },
  { id: 'github-copilot', displayName: 'GitHub Copilot', relativePath: '.github/instructions/proctor.instructions.md', scriptable: false },
];
