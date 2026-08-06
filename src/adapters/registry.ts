export interface AgentAdapter {
  id: string;
  displayName: string;
  /** path relative to the consuming repo's cwd */
  relativePath: string;
  /** true if this agent also gets a bench AgentRunner wired up */
  scriptable: boolean;
  /**
   * Optional per-format transform applied to the canonical SKILL.md content before writing.
   * MUST be a pure function of the canonical string, never hardcode ruleset prose here.
   * Transforms may only wrap/prefix static format scaffolding (e.g. YAML frontmatter) around
   * the canonical content; they must never mutate, omit, or duplicate the ruleset body itself.
   * If absent, the adapter gets a byte-for-byte verbatim copy (current default behavior).
   *
   * Mutually exclusive with `shared`: a merged block cannot carry file-level frontmatter.
   */
  transform?: (canonical: string) => string;
  /**
   * True when this path is a shared instructions file the user also writes their own content
   * into (AGENTS.md, GEMINI.md, WARP.md, .goosehints, ...) rather than a proctor-owned file.
   * install-skill merges the ruleset into a delimited managed block and leaves everything else
   * in the file untouched; drift-check compares only that block. See src/adapters/block.ts.
   */
  shared?: boolean;
}

// Cursor's `.mdc` convention supports `description`, `globs`, and `alwaysApply` YAML frontmatter
// keys that materially affect whether the rule auto-attaches. This is a pure function of `canonical`, it only prepends static frontmatter
// scaffolding; the canonical body passes through byte-for-byte, exactly once, unmodified.
export function cursorMdcTransform(canonical: string): string {
  return `---
description: proctor honest-completion ruleset, catches tests deleted, skipped, weakened, or gamed to fake a passing build
globs: '**'
alwaysApply: true
---

${canonical}`;
}

// Agent Skills frontmatter, the open format Claude Code and Cursor both read. An agent uses the
// `description` to decide when to load a skill on its own. Without one it falls back to the
// first paragraph of the body, which describes what the file is rather than when it applies, so
// the skill loads less reliably at the moments that matter. Pure function of `canonical`: only
// prepends frontmatter, the ruleset body passes through unchanged.
export function skillFrontmatterTransform(canonical: string): string {
  return `---
name: proctor
description: Honest-completion ruleset for changes that touch tests or the code they cover. Use before deleting, skipping, renaming, or rewriting a test, before weakening an assertion, and before hardcoding or stubbing an implementation to make a test pass. Also covers what to do when a test looks genuinely wrong.
---

${canonical}`;
}

// GitHub's `.github/instructions/*.instructions.md` convention requires an `applyTo` glob key to declare which files the instructions
// scope to, without it, the instructions may not be applied at all. Pure function of `canonical`;
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
  // Claude Code gets skill frontmatter via skillFrontmatterTransform so the ruleset carries an explicit
  // description and loads when it is actually relevant.
  { id: 'claude-code', displayName: 'Claude Code', relativePath: '.claude/skills/proctor/SKILL.md', scriptable: true, transform: skillFrontmatterTransform },
  // Codex reads skills from `.agents/skills/` and REQUIRES `name` and `description` frontmatter;
  // without it the skill is not recognized, so this path needs the same transform Claude Code uses.
  { id: 'codex', displayName: 'Codex CLI', relativePath: '.agents/skills/proctor/SKILL.md', scriptable: true, transform: skillFrontmatterTransform },
  // Cursor gets .mdc YAML frontmatter (description/globs/alwaysApply) via cursorMdcTransform
  // so the rule reliably auto-attaches.
  { id: 'cursor', displayName: 'Cursor', relativePath: '.cursor/rules/proctor.mdc', scriptable: true, transform: cursorMdcTransform },
  // Windsurf's rules.md is the workspace rules file users write their own rules into, not a
  // proctor-owned path, so it merges rather than overwrites.
  { id: 'windsurf', displayName: 'Windsurf', relativePath: '.windsurf/rules/rules.md', scriptable: false, shared: true },
  { id: 'gemini-cli', displayName: 'Gemini CLI', relativePath: 'GEMINI.md', scriptable: true, shared: true },
  { id: 'aider', displayName: 'Aider', relativePath: 'CONVENTIONS.md', scriptable: true, shared: true },
  { id: 'continue', displayName: 'Continue.dev', relativePath: '.continue/rules/proctor.md', scriptable: true },
  { id: 'cline', displayName: 'Cline', relativePath: '.clinerules/proctor.md', scriptable: true },
  // Amazon Q Developer CLI is mid-transition to a closed-source "Kiro CLI", so treat this path
  // as unstable: adapter only, no bench runner wired up.
  { id: 'amazon-q', displayName: 'Amazon Q Developer', relativePath: '.amazonq/rules/proctor.md', scriptable: false },
  // GitHub Copilot gets `applyTo: '**'` frontmatter via copilotApplyToTransform so the scoped
  // instructions file actually activates.
  { id: 'github-copilot', displayName: 'GitHub Copilot', relativePath: '.github/instructions/proctor.instructions.md', scriptable: false, transform: copilotApplyToTransform },
  { id: 'zed', displayName: 'Zed', relativePath: '.rules', scriptable: false, shared: true },
  // Universal cross-vendor AGENTS.md standard (Linux Foundation-stewarded). Also covers Codex
  // CLI's actual documented convention (developers.openai.com/codex/guides/agents-md) for free,
  // the existing `codex` entry above deliberately keeps its original `.agents/skills/` path.
  { id: 'agents-md', displayName: 'AGENTS.md (universal)', relativePath: 'AGENTS.md', scriptable: false, shared: true },
  // OpenHands' repo microagent is the one repo-wide instructions file, user-authored.
  { id: 'openhands', displayName: 'OpenHands', relativePath: '.openhands/microagents/repo.md', scriptable: true, shared: true },
  // Kiro (AWS agentic IDE / Kiro CLI) intentionally coexists with the `amazon-q` entry above,
  // they are two separately-installed products today. Revisit consolidation if the
  // Amazon Q to Kiro merge ever completes.
  { id: 'kiro', displayName: 'Kiro', relativePath: '.kiro/steering/proctor.md', scriptable: true },
  { id: 'tabnine', displayName: 'Tabnine', relativePath: '.tabnine/guidelines/proctor.md', scriptable: true },
  { id: 'trae', displayName: 'Trae', relativePath: '.trae/rules/proctor.md', scriptable: false },
  { id: 'github-copilot-global', displayName: 'GitHub Copilot (global)', relativePath: '.github/copilot-instructions.md', scriptable: false, shared: true },
  // Qodo's canonical path is a generic, un-namespaced repo-root filename that will often already
  // hold unrelated user content, so it merges into a managed block instead of overwriting.
  { id: 'qodo', displayName: 'Qodo', relativePath: 'best_practices.md', scriptable: true, shared: true },

  // --- Agents added after the first roster, all with a stable file-based repo convention ---

  // Roo Code reads every file under .roo/rules/ recursively, so a proctor-owned file drops in
  // cleanly alongside whatever else the user keeps there.
  { id: 'roo-code', displayName: 'Roo Code', relativePath: '.roo/rules/proctor.md', scriptable: false },
  // Kilo Code v7 moved config to kilo.jsonc but still auto-includes .kilocode/rules/ for
  // backward compatibility, which is the only path proctor can write without editing user config.
  { id: 'kilo-code', displayName: 'Kilo Code', relativePath: '.kilocode/rules/proctor.md', scriptable: true },
  { id: 'augment', displayName: 'Augment Code', relativePath: '.augment/rules/proctor.md', scriptable: true },
  // Google Antigravity defaults to .agents/rules/ (with .agent/rules/ still read as a fallback).
  // Distinct subdirectory from the `codex` entry's .agents/skills/, so the two never collide.
  { id: 'antigravity', displayName: 'Google Antigravity', relativePath: '.agents/rules/proctor.md', scriptable: false },
  // goose reads a single .goosehints file per directory, user-authored.
  { id: 'goose', displayName: 'goose', relativePath: '.goosehints', scriptable: true, shared: true },
  // Junie now prefers AGENTS.md (covered above) but still reads .junie/guidelines.md, which
  // keeps older Junie installs covered.
  { id: 'junie', displayName: 'JetBrains Junie', relativePath: '.junie/guidelines.md', scriptable: true, shared: true },
  { id: 'qwen-code', displayName: 'Qwen Code', relativePath: 'QWEN.md', scriptable: true, shared: true },
  // Crush reads CRUSH.md for Crush-specific rules in addition to AGENTS.md.
  { id: 'crush', displayName: 'Crush', relativePath: 'CRUSH.md', scriptable: true, shared: true },
  // Warp defaults to AGENTS.md now, but WARP.md still takes priority when both exist, so the
  // ruleset has to be in both for Warp users who already have a WARP.md.
  { id: 'warp', displayName: 'Warp', relativePath: 'WARP.md', scriptable: false, shared: true },
  // Amp's own file is AGENT.md, singular, which is a different file from the universal AGENTS.md.
  { id: 'amp', displayName: 'Amp', relativePath: 'AGENT.md', scriptable: true, shared: true },
  // Firebase Studio generates .idx/airules.md with its own default rules, so merge rather than
  // replace them.
  { id: 'firebase-studio', displayName: 'Firebase Studio', relativePath: '.idx/airules.md', scriptable: false, shared: true },
  // Replit Agent reads AGENTS.md as well, but replit.md is its native file and is auto-generated.
  { id: 'replit', displayName: 'Replit Agent', relativePath: 'replit.md', scriptable: false, shared: true },
];
