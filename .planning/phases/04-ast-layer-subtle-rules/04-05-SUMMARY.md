---
phase: 04-ast-layer-subtle-rules
plan: 05
subsystem: engine-async-rh008
tags: [rh008, engine, async, ast-pre-pass, tdd, signatures]
dependency_graph:
  requires: [04-03, 04-04]
  provides: [rh008, async-engine, ast-pre-pass, all-8-signatures]
  affects:
    - src/signatures/rh008.ts
    - src/signatures/index.ts
    - src/engine.ts
    - src/cli.ts
    - tests/signatures/rh008.test.ts
    - tests/engine.test.ts
tech_stack:
  added: []
  patterns:
    - "RH008 two-phase AI gate: heuristic always runs, reports [] without aiEnabled (D-11/D-14)"
    - "Tautological assertion patterns: ASSERT_TRUE, ASSERT_SELF, EXPECT_SELF, EXPECT_ZERO_ARG"
    - "Union Signature type (Finding[] | Promise<Finding[]>) with engine Promise.all dispatch"
    - "AST pre-pass conditional on AST_RULES in ctx.enabled (AST-02 compliance)"
    - "buildAstMap: readFileSync + parseSource per JS/TS file; fail-open with stderr warning (D-03)"
key_files:
  created:
    - src/signatures/rh008.ts
    - tests/signatures/rh008.test.ts
  modified:
    - src/signatures/index.ts
    - src/engine.ts
    - tests/engine.test.ts
    - src/cli.ts
decisions:
  - "Union Signature type (Finding[] | Promise<Finding[]>) allows sync sigs unchanged, async sigs added natively"
  - "index.ts update committed with rh008 GREEN; engine.ts update committed immediately after to maintain TypeScript clean state"
  - "src/cli.ts await runChecks() auto-fixed (Rule 3) alongside engine migration to maintain TypeScript compilation"
  - "AST_RULES = ['RH002','RH004','RH005','RH008'] — pre-pass gate per D-02"
metrics:
  duration: "~4 minutes"
  completed: "2026-07-06T04:29:04Z"
  tasks_completed: 2
  files_changed: 6
---

# Phase 4 Plan 5: RH008 + Async Engine + AST Pre-Pass Summary

Create RH008 (tautological assertion detection), update the signature registry to the union type with all 8 signatures, migrate runChecks to async with AST pre-pass, and update all callers. All 8 signatures are now registered; the engine dispatches them with `Promise.all`.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 (RED) | Failing tests for rh008 | dd2697c | Complete |
| 1 (GREEN) | Create rh008.ts + update index.ts | 494d61f | Complete |
| 2 | Async engine + AST pre-pass + engine tests | 7c22d27 | Complete |

## What Was Built

**`src/signatures/rh008.ts` — Tautological assertion detection (new file):**
- `async function rh008(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]>`
- D-14 patterns: `ASSERT_TRUE` (`/\bassert True\b/`), `ASSERT_SELF` (`/\bassert\s+(\w+)\s*==\s*\1\b/`), `EXPECT_SELF` (`/expect\((.+?)\)\.toBe\(\1\)/`), `EXPECT_ZERO_ARG` (`/expect\(\s*\)\.(toBeTruthy|toBeDefined|toBeNull)\(\)/`)
- `isTautology(content)` helper ORing all four patterns
- Two-phase design (D-11): heuristic scans added lines in test files; `if (!ctx.aiEnabled || !ctx.judge) return []`
- AI confirmation via `ctx.judge.judge()` for each candidate; `severity: 'warn'`

**`tests/signatures/rh008.test.ts` — 5 tests covering SIG-08:**
- `aiEnabled=false` returns `[]` even with `assert True` in test file
- `judge=true` + `assert True` in test file returns 1 finding with `ruleId=RH008`, `severity=warn`
- `judge=true` + `expect(result).toBe(result)` self-comparison returns 1 finding
- Non-test file with `assert True` returns `[]` (only test files checked)
- `judge=false` returns `[]`

**`src/signatures/index.ts` — Updated registry:**
- Signature type changed to union: `(files: ParsedFile[], ctx: RepoContext) => Finding[] | Promise<Finding[]>`
- All 8 signatures registered: `[rh001, rh002, rh003, rh004, rh005, rh006, rh007, rh008]`
- Existing sync signatures satisfy union type unchanged

**`src/engine.ts` — Async engine with AST pre-pass:**
- `export async function runChecks(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]>`
- New `buildAstMap(files, ctx)` function:
  - `AST_RULES = ['RH002', 'RH004', 'RH005', 'RH008']`
  - Returns empty `Map` immediately if `needsAst` is false (AST-02: no startup cost for RH001/003/006/007)
  - Reads each JS/TS file via `readFileSync(join(ctx.cwd, filePath))`, parses with `parseSource()`
  - Fail-open: `process.stderr.write(...)` on parse failure, skip file (D-03)
  - Normalizes paths with `norm()` for Windows compatibility (Pitfall 5)
- `ctx.ast = buildAstMap(files, ctx)` called BEFORE `Promise.all(signatures.map(...))`
- Engine uses `await Promise.all(signatures.map(sig => Promise.resolve(sig(files, ctx))))` + `.flat()` for both sync and async signatures

**`tests/engine.test.ts` — Updated engine tests:**
- All 7 existing `it()` callbacks made async: `it('...', async () => { ... })`
- All `runChecks(...)` calls changed to `await runChecks(...)`
- 2 new AST pre-pass tests in `describe('runChecks AST pre-pass')`:
  - RH001/RH003 enabled → `ctx.ast.size === 0` (pre-pass skipped)
  - RH004 enabled → `ctx.ast instanceof Map` (pre-pass ran)
- All 9 tests pass

**`src/cli.ts` — Caller fixed (Rule 3 auto-fix):**
- `const findings = runChecks(...)` → `const findings = await runChecks(...)`

## TDD Gate Compliance

| Gate | Commit | Satisfied |
|------|--------|-----------|
| RED (rh008) | dd2697c — `test(04-05): add failing tests for rh008 tautological assertion detection (RED)` | Yes |
| GREEN (rh008) | 494d61f — `feat(04-05): implement rh008 tautological assertion detection (GREEN)` | Yes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] src/cli.ts needed await for async runChecks**
- **Found during:** Task 2 (TypeScript compilation check after engine migration)
- **Issue:** `cli.ts` called `runChecks(accepted, ctx)` synchronously; after engine became async, TypeScript reported 6 type errors on `findings` (Promise vs array)
- **Fix:** Changed to `await runChecks(accepted, ctx)` — correct, required, no behavior change
- **Files modified:** `src/cli.ts`
- **Commit:** 7c22d27

### Plan Alignment Note

**2. index.ts update timing relative to TypeScript compilation**
- **Plan spec:** index.ts (Task 1 commit) then engine.ts (Task 2 commit)
- **Reality:** index.ts updated with union Signature type causes TypeScript errors in engine.ts until Task 2 completes. This is expected (noted in CRITICAL parallel execution instructions).
- **Action:** Committed index.ts with Task 1 GREEN (494d61f), then immediately committed engine.ts + engine.test.ts + cli.ts together (7c22d27). TypeScript is clean after Task 2.
- **Impact:** Zero — both tasks completed in immediate sequence as required.

## Pre-existing Test Failures (Out of Scope)

Same 14 pre-existing failures documented in 04-04 SUMMARY remain:
- `tests/cli.test.ts`: 13 failures — CLI smoke tests require `dist/cli.js` which is not built in this worktree
- `tests/pre-classifier.test.ts`: 1 failure — `mode-only` fixture mismatch pre-existing from earlier plans

Zero regressions introduced by this plan. All 9 engine tests pass, all 5 rh008 tests pass, all 16 signature+AST+engine test files pass (108+ tests total).

## Known Stubs

None — rh008 implementation is complete. The AI gate is the intended design (D-11), not a stub.

## Threat Flags

No new security-relevant surface beyond what was documented in the plan's threat model:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: DoS-mitigated | src/engine.ts | buildAstMap wraps parseSource() in try/catch per T-04-09; malformed files return null, never crash proctor |
| threat_flag: accepted | src/engine.ts | ctx.ast mutated before signatures run (T-04-10); Node.js single-threaded, no race condition possible |

## Self-Check

### Files Exist
- [x] `src/signatures/rh008.ts` — async rh008 with D-14 patterns and D-11 AI gate
- [x] `tests/signatures/rh008.test.ts` — 5 tests, all pass
- [x] `src/signatures/index.ts` — union Signature type, all 8 sigs registered
- [x] `src/engine.ts` — async runChecks, buildAstMap, ctx.ast = pre-pass
- [x] `tests/engine.test.ts` — 9 tests (7 existing async + 2 new AST pre-pass), all pass

### Verification Results
- [x] `npm test -- tests/signatures/rh008.test.ts` → 5/5 tests pass
- [x] `npm test -- tests/engine.test.ts` → 9/9 tests pass
- [x] `npx tsc --noEmit` → exits 0
- [x] `src/signatures/index.ts` contains imports for rh004, rh005, rh006, rh008
- [x] `src/engine.ts` contains: `export async function runChecks`, `buildAstMap`, `ctx.ast =`
- [x] `ctx.ast` is NOT populated when only RH001/RH003 in `ctx.enabled` (verified by test)
- [x] `ctx.ast` is a `Map` when RH004 is enabled (verified by test)

### Commits Exist
- [x] dd2697c — test(04-05): add failing tests for rh008 tautological assertion detection (RED)
- [x] 494d61f — feat(04-05): implement rh008 tautological assertion detection (GREEN)
- [x] 7c22d27 — feat(04-05): async engine migration, AST pre-pass, all 8 signatures dispatched

## Self-Check: PASSED
