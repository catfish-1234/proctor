---
phase: 04-ast-layer-subtle-rules
plan: 06
subsystem: cli-ai-wiring
tags: [cli, ai-judge, anthropic, dynamic-import, tsup]
dependency_graph:
  requires: [04-05]
  provides: [cli-06, ai-flag-wired]
  affects:
    - src/cli.ts
    - tests/cli.test.ts
    - tsup.config.ts
tech_stack:
  added: []
  patterns:
    - "Dynamic import pattern: await import('./ai/judge.js') inside if(options.ai) guard"
    - "API key validation: process.env['ANTHROPIC_API_KEY'] guard, exit 1 with informative message"
    - "ctx.aiEnabled + ctx.judge mutation before runChecks call"
    - "@typescript-eslint/typescript-estree marked external in tsup to avoid CJS bundling issue"
key_files:
  created: []
  modified:
    - src/cli.ts
    - tests/cli.test.ts
    - tsup.config.ts
decisions:
  - "Dynamic import (not static) for createAnthropicJudge — lazy load, tree-shaking, and avoids bundling the Anthropic SDK conditionally"
  - "exit 1 (not exit 2) on missing API key — user error, not a cheat detection result"
  - "[Rule 3] @typescript-eslint/typescript-estree added to tsup external list — CJS package uses dynamic require() which is incompatible with bundled ESM"
metrics:
  duration: "~8 minutes"
  completed: "2026-07-06T04:37:34Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 4 Plan 6: --ai Flag Wiring Summary

Wire the `--ai` flag in cli.ts: validate `ANTHROPIC_API_KEY`, dynamically import the judge module, mutate ctx with `aiEnabled`/`judge`, and add a smoke test for the API key missing error path. Also fix the tsup build (Rule 3) to mark `@typescript-eslint/typescript-estree` external so the CLI bundle works at runtime.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Wire --ai flag in src/cli.ts | 29e8584 | Complete |
| 2 | Add --ai smoke tests to tests/cli.test.ts | 4b8070c | Complete |

## What Was Built

**`src/cli.ts` — --ai flag wired:**
- `if (options.ai)` guard block inserted after `buildRepoContext(cwd)` call
- Reads `process.env['ANTHROPIC_API_KEY']`; if empty/unset, writes error to stderr and `process.exit(1)`
- Error message: `"proctor: --ai requires ANTHROPIC_API_KEY env var. Set it or run without --ai.\n"`
- Dynamically imports `createAnthropicJudge` from `'./ai/judge.js'` (not a static top-level import)
- Sets `ctx.aiEnabled = true` and `ctx.judge = createAnthropicJudge(apiKey, model)`
- Fallback model: `ctx.aiModel ?? 'claude-haiku-4-5-20251001'`
- `await runChecks(accepted, ctx)` was already applied by plan 04-05 Rule 3 auto-fix

**`tests/cli.test.ts` — new describe block `check --ai flag`:**
- Test 1: `proctor check --ai` with `ANTHROPIC_API_KEY=''` exits code 1, stderr contains `'--ai requires ANTHROPIC_API_KEY'`
- Test 2: `proctor check` (no `--ai`) on a clean git repo exits code 0 (offline regression guard)
- Both tests follow the same `git init` + first commit + `spawnSync` pattern as existing tests
- All 15 CLI tests pass

**`tsup.config.ts` — [Rule 3] external list extended:**
- Added `'@typescript-eslint/typescript-estree'` to the `external` array alongside `'@anthropic-ai/sdk'`
- Prevents bundling a CJS package into ESM output (dynamic `require("tty")` was crashing the CLI)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsup bundling @typescript-eslint/typescript-estree into ESM caused runtime crash**
- **Found during:** Task 2 (CLI test run — `dist/cli.js` crashed on startup with `Dynamic require of "tty" is not supported`)
- **Issue:** `@typescript-eslint/typescript-estree` (introduced in plan 04-05 via `src/ast.ts`) uses internal CJS `require()` calls. When bundled into the ESM output by tsup, these fail at runtime.
- **Fix:** Added `'@typescript-eslint/typescript-estree'` to `external` list in `tsup.config.ts` — package now loads from `node_modules` at runtime, not bundled.
- **Files modified:** `tsup.config.ts`
- **Commit:** 4b8070c (same commit as Task 2)
- **Result:** `dist/cli.js` shrank from 10.6MB to 31KB; all 15 CLI tests pass

## Pre-existing Failures (Out of Scope)

- `tests/pre-classifier.test.ts`: 1 failure — `mode-only` fixture mismatch pre-existing from earlier plans (documented in 04-05 SUMMARY, out of scope)

Zero regressions introduced by this plan. 123/124 tests pass (1 pre-existing failure unchanged).

## Known Stubs

None — the --ai flag wiring is complete. The AI gate in signatures (rh004/005/008 return [] without aiEnabled) is the intended design, not a stub.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigated (T-04-12) | src/cli.ts | ANTHROPIC_API_KEY is never echoed to stderr; error message only states the key is missing |
| threat_flag: accepted (T-04-13) | src/cli.ts | --ai is explicit opt-in; without flag, zero network calls are made |

## Self-Check

### Files Exist
- [x] `src/cli.ts` — contains `ctx.aiEnabled = true`, `await import('./ai/judge.js')`, `await runChecks(accepted, ctx)`
- [x] `tests/cli.test.ts` — contains `describe('check --ai flag')` with 2 new tests
- [x] `tsup.config.ts` — external includes `'@typescript-eslint/typescript-estree'`

### Verification Results
- [x] `npx tsc --noEmit` exits 0
- [x] `npm test -- tests/cli.test.ts` — 15/15 pass
- [x] `npm test` — 123/124 pass (1 pre-existing failure, no regressions)
- [x] `proctor check --ai` with empty ANTHROPIC_API_KEY exits 1, stderr: `"proctor: --ai requires ANTHROPIC_API_KEY env var. Set it or run without --ai."`
- [x] `src/cli.ts` has no static top-level import for `createAnthropicJudge`

### Commits Exist
- [x] 29e8584 — feat(04-06): wire --ai flag in cli.ts with API key validation and dynamic judge import
- [x] 4b8070c — feat(04-06): add --ai smoke tests + fix tsup external for @typescript-eslint/typescript-estree

## Self-Check: PASSED
