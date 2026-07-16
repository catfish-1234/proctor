export interface AgentAdapter {
  id: string;
  displayName: string;
  /** path relative to the consuming repo's cwd */
  relativePath: string;
  /** true if this agent also gets a bench AgentRunner wired up */
  scriptable: boolean;
  /**
   * Optional per-format transform applied to the canonical SKILL.md content before writing.
   * MUST be a pure function of the canonical string — never hardcode ruleset prose here.
   * Transforms may only wrap/prefix static format scaffolding (e.g. YAML frontmatter) around
   * the canonical content; they must never mutate, omit, or duplicate the ruleset body itself.
   * If absent, the adapter gets a byte-for-byte verbatim copy (current default behavior).
   */
  transform?: (canonical: string) => string;
}

// Transform proof case 1 (AGENT-04): Cursor's `.mdc` convention supports `description`,
// `globs`, and `alwaysApply` YAML frontmatter keys that materially affect whether the rule
// auto-attaches. This is a pure function of `canonical` — it only prepends static frontmatter
// scaffolding; the canonical body passes through byte-for-byte, exactly once, unmodified.
export function cursorMdcTransform(canonical: string): string {
  return `---
description: proctor honest-completion ruleset — catches tests deleted, skipped, weakened, or gamed to fake a passing build
globs: **
alwaysApply: true
---

${canonical}`;
}

// Transform proof case 2 (AGENT-04, Pitfall 1 fix): GitHub's `.github/instructions/*.instructions.md`
// convention requires an `applyTo` glob frontmatter key to declare which files the instructions
// scope to — without it, the instructions may not be applied at all. Pure function of `canonical`;
// only prepends static frontmatter scaffolding, the canonical body passes through unmodified.
export function copilotApplyToTransform(canonical: string): string {
  return `---
applyTo: '**'
---

${canonical}`;
}

// Single source of truth: agent id, deployment path, and whether the bench harness can drive it.
// `install-skill` writes the canonical src/skill/SKILL.md content to every path below.
// `drift-check` re-reads every existing path and hashes it against the canonical copy.
// Don't duplicate this id-to-path mapping anywhere else in the codebase.
export const AGENT_ADAPTERS: AgentAdapter[] = [
  { id: 'claude-code', displayName: 'Claude Code', relativePath: '.claude/skills/proctor/SKILL.md', scriptable: true },
  { id: 'codex', displayName: 'Codex CLI', relativePath: '.agents/skills/proctor/SKILL.md', scriptable: true },
  // Cursor gets .mdc YAML frontmatter (description/globs/alwaysApply) via cursorMdcTransform
  // so the rule reliably auto-attaches — see AGENT-04.
  { id: 'cursor', displayName: 'Cursor', relativePath: '.cursor/rules/proctor.mdc', scriptable: true, transform: cursorMdcTransform },
  { id: 'windsurf', displayName: 'Windsurf', relativePath: '.windsurf/rules/rules.md', scriptable: false },
  { id: 'gemini-cli', displayName: 'Gemini CLI', relativePath: 'GEMINI.md', scriptable: true },
  { id: 'aider', displayName: 'Aider', relativePath: 'CONVENTIONS.md', scriptable: true },
  { id: 'continue', displayName: 'Continue.dev', relativePath: '.continue/rules/proctor.md', scriptable: true },
  { id: 'cline', displayName: 'Cline', relativePath: '.clinerules/proctor.md', scriptable: true },
  // Amazon Q Developer CLI is mid-transition to a closed-source "Kiro CLI", so treat this path
  // as unstable: adapter only, no bench runner wired up.
  { id: 'amazon-q', displayName: 'Amazon Q Developer', relativePath: '.amazonq/rules/proctor.md', scriptable: false },
  // GitHub Copilot gets `applyTo: '**'` frontmatter via copilotApplyToTransform so the scoped
  // instructions file actually activates — see AGENT-04, Pitfall 1.
  { id: 'github-copilot', displayName: 'GitHub Copilot', relativePath: '.github/instructions/proctor.instructions.md', scriptable: false, transform: copilotApplyToTransform },
  { id: 'zed', displayName: 'Zed', relativePath: '.rules', scriptable: false },
  // Universal cross-vendor AGENTS.md standard (Linux Foundation-stewarded). Also covers Codex
  // CLI's actual documented convention (developers.openai.com/codex/guides/agents-md) for free —
  // the existing `codex` entry below intentionally keeps its original `.agents/skills/` path
  // unchanged (Open Question 1 decision: do not silently change a locked Phase 6 entry).
  { id: 'agents-md', displayName: 'AGENTS.md (universal)', relativePath: 'AGENTS.md', scriptable: false },
  { id: 'openhands', displayName: 'OpenHands', relativePath: '.openhands/microagents/repo.md', scriptable: true },
  // Kiro (AWS agentic IDE / Kiro CLI) intentionally coexists with the `amazon-q` entry above —
  // they are two separately-installed products today (Open Question 2 decision); revisit
  // consolidation once/if the Amazon Q -> Kiro merge completes.
  { id: 'kiro', displayName: 'Kiro', relativePath: '.kiro/steering/proctor.md', scriptable: true },
  { id: 'tabnine', displayName: 'Tabnine', relativePath: '.tabnine/guidelines/proctor.md', scriptable: true },
  { id: 'trae', displayName: 'Trae', relativePath: '.trae/rules/proctor.md', scriptable: false },
  { id: 'github-copilot-global', displayName: 'GitHub Copilot (global)', relativePath: '.github/copilot-instructions.md', scriptable: false },
];
