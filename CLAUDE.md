# proctor — Project Guide

## What This Is

`proctor` catches AI coding agents gaming their own test suites — deleting tests, skipping them, weakening assertions, or hardcoding outputs to fake a green build. It ships as a CLI diff analyzer, a Claude Code Stop hook, and a reproducible benchmark.

See `.planning/PROJECT.md` for full project context.

## GSD Workflow

This project uses [GSD](https://github.com/anthropics/get-shit-done) for structured phase-based development.

**Current phase:** See `.planning/STATE.md`
**Roadmap:** `.planning/ROADMAP.md`
**Requirements:** `.planning/REQUIREMENTS.md`

### Commands

```
/gsd:discuss-phase N     # Gather context and clarify approach for phase N
/gsd:plan-phase N        # Create PLAN.md for phase N
/gsd:execute-phase N     # Execute all plans in phase N
/gsd:progress            # Check current status
/gsd:verify-work         # Verify phase goal achievement
```

### Rules

- Do not modify, skip, or delete tests to make them pass
- If a test appears genuinely wrong, STOP and flag to the human with rationale
- A fix is not done until the original, unaltered tests pass (or human explicitly approved a test change)
- Never hardcode implementation values to match test fixture literals
- Never gut real logic behind an always-true mock

## Tech Stack

- TypeScript, Node 20+, ESM
- tsup (build), vitest (tests), commander (CLI), picocolors (output)
- `@typescript-eslint/typescript-estree` for JS/TS AST (pure JS, no native compilation)
- `parse-diff` for git diff parsing
- Deterministic core — zero network required; `--ai` is purely additive

## Project Structure

```
src/
  cli.ts                   # entrypoint
  diff.ts                  # git diff parser
  context.ts               # RepoContext builder
  signatures/              # RH001–RH008 pure check functions
  ast.ts                   # singleton grammar loader
  ai/                      # optional LLM judge (dynamic import)
  reporters/               # pretty.ts, json.ts, sarif.ts
  hooks/                   # git hook + Claude Code Stop hook
  skill/SKILL.md           # L1 canonical honest-completion ruleset
  adapters/                # per-agent copies + drift check
  bench/                   # held-out-test harness
fixtures/                  # one planted cheat per RH-ID
```

## Key Conventions

- Signature checks are pure functions: `(diff: ParsedDiff, ctx: RepoContext) => Finding[]`
- No I/O, no network, no global state inside signature functions
- Diff pre-classifier runs before any signature logic (rejects binary/mode-only/submodule/combined diffs)
- Claude Code Stop hook exits 2 to block (never exits 1 — that's non-blocking in Claude Code)
- `chmod +x` does not work on Windows — use `git add --chmod=+x`
