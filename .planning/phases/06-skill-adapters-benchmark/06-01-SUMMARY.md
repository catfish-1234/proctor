---
phase: 06-skill-adapters-benchmark
plan: 01
subsystem: testing
tags: [skill, agent-adapters, drift-check, cli, sha256, honest-completion]

# Dependency graph
requires:
  - phase: 05-sarif-github-action
    provides: RULE_METADATA in src/rules.ts and existing CLI command patterns (install-hook, install-claude-hook)
provides:
  - "canonical src/skill/SKILL.md: L1 honest-completion ruleset with 5 core rules, guard-exists statement, and RH001-RH008 reference table sourced from RULE_METADATA"
  - "src/adapters/registry.ts: AGENT_ADAPTERS single-source registry (10 agents: 5 mandatory + 5 additional low-risk)"
  - "proctor install-skill: deploys canonical SKILL.md byte-identical to every AGENT_ADAPTERS path"
  - "src/adapters/drift-check.ts + proctor drift-check: sha256 byte-comparison, exits nonzero listing diverged adapters, absent adapters not counted as drifted"
affects: [06-skill-adapters-benchmark (plan 02/03 benchmark half), future-agent-adapter-additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source adapter registry (AGENT_ADAPTERS) consumed by both install-skill and drift-check to avoid path duplication"
    - "sha256 byte-comparison for drift detection (node:crypto createHash, reused from src/reporters/sarif.ts pattern)"
    - "ENOENT-as-not-drifted convention mirrored from src/context.ts's config-read error branching"

key-files:
  created:
    - src/skill/SKILL.md
    - src/adapters/registry.ts
    - src/adapters/drift-check.ts
    - tests/skill.test.ts
    - tests/drift-check.test.ts
  modified:
    - src/cli.ts
    - package.json
    - tests/cli.test.ts

key-decisions:
  - "Cursor adapter ships plain canonical content (no .mdc YAML frontmatter) per D-03, keeping drift-check byte-for-byte zero-false-positive"
  - "Registry includes 10 agents total: 5 mandatory (claude-code, codex, cursor, windsurf, gemini-cli) + 5 additional low-risk (aider, continue, cline, amazon-q, github-copilot), each with a distinct relativePath"
  - "Amazon Q adapter marked non-scriptable with a code comment noting it is mid-transition to closed-source Kiro CLI (volatile target per RESEARCH)"

patterns-established:
  - "Adapter deployment/verification split: install-skill writes, drift-check only reads+hashes+reports (no writes), keeping drift-check side-effect-free"

requirements-completed: [SKILL-01, SKILL-02, SKILL-03]

# Metrics
duration: ~5min (resumed session; Task 1 authored SKILL.md + skill.test.ts in a prior session killed by usage limit)
completed: 2026-07-07
---

# Phase 06 Plan 01: Skill + Adapters + Drift-Check Summary

**Canonical honest-completion SKILL.md deployed byte-identical to 10 agent adapter paths via `proctor install-skill`, with sha256-based `proctor drift-check` guarding single-source integrity.**

## Performance

- **Duration:** ~5 min for Tasks 2-3 this session (Task 1 was completed and committed in a prior session that was killed mid-plan by a usage limit)
- **Completed:** 2026-07-07
- **Tasks:** 3 (all complete)
- **Files modified:** 8

## Accomplishments
- Canonical `src/skill/SKILL.md` written with the 5 core honest-completion rules, a guard-exists statement (D-02: proctor runs on every commit/turn via Stop hook + pre-commit hook and blocks on error-severity violations), and an RH001-RH008 reference table sourced verbatim from `RULE_METADATA`
- `AGENT_ADAPTERS` single-source registry covering 10 agents (5 mandatory: Claude Code, Codex, Cursor, Windsurf, Gemini CLI; 5 additional: Aider, Continue.dev, Cline, Amazon Q, GitHub Copilot), each with a unique deployment path
- `proctor install-skill` deploys byte-identical canonical content to every registry path
- `proctor drift-check` compares deployed adapters against canonical by sha256, exits nonzero and lists diverged paths on stderr, treats never-installed adapters as not-drifted

## Task Commits

Each task was committed atomically:

1. **Task 1: Author canonical src/skill/SKILL.md and its content test** - `e1e8ab4` (feat) — committed in prior session
2. **Task 2: AGENT_ADAPTERS registry + proctor install-skill command + smoke test** - `67993e9` (feat)
3. **Task 3: drift-check module + proctor drift-check subcommand + tests** - `8578665` (feat)

## Files Created/Modified
- `src/skill/SKILL.md` - Canonical L1 honest-completion skill (5 rules, guard-exists statement, RH-ID table)
- `src/adapters/registry.ts` - `AgentAdapter` interface + `AGENT_ADAPTERS` array (10 entries)
- `src/adapters/drift-check.ts` - `checkAdapterDrift(cwd, canonical)` sha256 comparison over registry paths
- `src/cli.ts` - Added `install-skill` and `drift-check` subcommands
- `package.json` - Added `src/skill/SKILL.md` to `files`, added `drift-check` npm script
- `tests/skill.test.ts` - SKILL.md content assertions vs `RULE_METADATA`
- `tests/cli.test.ts` - `install-skill` byte-identical smoke test + `--help` test
- `tests/drift-check.test.ts` - `checkAdapterDrift` unit tests + `drift-check` CLI smoke tests (clean pass, post-mutation fail)

## Decisions Made
- Resumed a killed prior session: verified Task 1's commit (`e1e8ab4`) and re-used the untracked `src/adapters/registry.ts` draft left behind after confirming its content already matched the Task 2 spec exactly (10 unique adapter paths, correct mandatory set) — no rewrite needed, just committed as-is with the rest of Task 2.
- Split the `install-skill` and `drift-check` CLI wiring into two commits (Task 2 / Task 3) by temporarily deferring the `drift-check` command block and its import until Task 3, so each task's commit only contains its own scoped files per `files_modified` in the plan frontmatter, while keeping `npm run build` green at every commit boundary.

## Deviations from Plan

None - plan executed exactly as written for Tasks 2 and 3. The pre-existing `src/adapters/registry.ts` draft found on resume matched the plan's Task 2 spec verbatim, so it was committed unmodified rather than rewritten.

## Issues Encountered
- `npm test` (full suite) surfaced one pre-existing failure in `tests/pre-classifier.test.ts` ("rejects mode-only diff" — expects reason `mode-only`, gets `rename-only`). This file and `src/pre-classifier.ts` are entirely outside this plan's `files_modified` scope, so it was not touched. Logged to `.planning/phases/06-skill-adapters-benchmark/deferred-items.md` for a future plan to address. All three scoped test files (`tests/skill.test.ts`, `tests/cli.test.ts`, `tests/drift-check.test.ts` — 26 tests total) pass cleanly, as does `npm run build` and `npm run typecheck`.

## Next Phase Readiness
- SKILL-01/02/03 fully satisfied: canonical skill authored, install-skill deploys to ≥4 agents (10 total), drift-check proves single-source integrity.
- This plan's outputs (`AGENT_ADAPTERS`, `src/skill/SKILL.md`) are independent of the benchmark half of Phase 6 (plans 02/03) and introduce no blockers for it.
- Pre-existing `pre-classifier.test.ts` failure remains open in `deferred-items.md` for a future plan.

---
*Phase: 06-skill-adapters-benchmark*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created files verified present (`src/skill/SKILL.md`, `src/adapters/registry.ts`, `src/adapters/drift-check.ts`, `tests/skill.test.ts`, `tests/drift-check.test.ts`, `06-01-SUMMARY.md`) and all four task/plan commits verified in git log (`e1e8ab4`, `67993e9`, `8578665`, `3f05707`).
