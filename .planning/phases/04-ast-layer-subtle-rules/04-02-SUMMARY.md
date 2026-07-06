---
phase: 04-ast-layer-subtle-rules
plan: 02
subsystem: ast-infrastructure
tags: [ast, typescript-estree, ai-judge, tsup, tdd, singleton]
dependency_graph:
  requires: [04-01]
  provides: [parseSource, src/ast.ts, dist/ai/judge.js, tsup-dual-entry]
  affects: [src/ast.ts, tests/ast.test.ts, tsup.config.ts]
tech_stack:
  added: []
  patterns:
    - "ESM singleton pattern via module-level parse() import with frozen PARSE_OPTIONS"
    - "TDD RED/GREEN cycle for AST singleton"
    - "tsup dual-entry with external SDK for dynamic import separation"
key_files:
  created:
    - src/ast.ts
    - tests/ast.test.ts
  modified:
    - tsup.config.ts
decisions:
  - "src/ai/judge.ts was already created in plan 04-01 (deviation from plan spec) — verified as satisfying all requirements (AIJudge, JudgeContext, createAnthropicJudge)"
  - "PARSE_OPTIONS frozen as const at module level — satisfies singleton requirement via ESM module cache"
  - "npm install required in worktree (packages declared in package.json from 04-01 but node_modules was empty in this worktree)"
metrics:
  duration: "~3 minutes"
  completed: "2026-07-06T04:12:09Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 4 Plan 2: AST Singleton + tsup Dual Entry Summary

Create `src/ast.ts` singleton wrapper around typescript-estree `parse()` with fail-open error handling, verify `src/ai/judge.ts` satisfies all requirements (pre-created in Plan 04-01), and extend `tsup.config.ts` to emit `dist/ai/judge.js` as a separate file for dynamic import.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 (RED) | Failing AST singleton tests | f2bead5 | Complete |
| 1 (GREEN) | Create src/ast.ts singleton wrapper | c8cdfab | Complete |
| 2 | Extend tsup.config.ts dual entry + external SDK | 19cbed3 | Complete |

## What Was Built

**`src/ast.ts` — AST singleton wrapper (new file):**
- `parseSource(content: string): TSESTree.Program | null`
- Options frozen at module level: `jsx: true, loc: true, range: false`
- try/catch wraps `parse()` — returns null on any exception (fail-open per D-03)
- Re-exports `TSESTree` type for callers
- Module-level singleton: ESM cache guarantees one module instance per process

**`tests/ast.test.ts` — 7 tests covering AST-01:**
- `const x = 1;` → Program with `body.length === 1`
- `function f() { return null; }` → body[0].type === 'FunctionDeclaration'
- Invalid syntax `!!!invalid syntax` → null (does not throw)
- Empty string → Program with `body === []`
- JSX `<div />` → Program (jsx: true working)
- TypeScript `const x: string = "y"` → Program
- Re-import identity check → same function reference (ESM singleton confirmed)

**`tsup.config.ts` — extended:**
- `entry: ['src/cli.ts', 'src/ai/judge.ts']` — second entry emits `dist/ai/judge.js`
- `external: ['@anthropic-ai/sdk']` — SDK not bundled (file is 639B, not 100KB+)
- Both changes applied together per documented pitfall requirements

**`src/ai/judge.ts` — verified (pre-created in Plan 04-01):**
- Exports `AIJudge`, `JudgeContext`, `createAnthropicJudge` — all required interfaces present
- No changes needed — satisfies all Task 2 requirements

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm install required in worktree**
- **Found during:** Task 1 GREEN (tests failed with "Cannot find package")
- **Issue:** Worktree had empty `node_modules/` despite packages being declared in `package.json` (installed in main repo by Plan 04-01 but not in this worktree)
- **Fix:** Ran `npm install` in the worktree — installed all declared packages from package.json
- **Files modified:** `node_modules/` (not committed; gitignored)
- **Commit:** n/a (npm install, not a code change)

### Plan Alignment Note

**2. [Pre-existing Deviation] src/ai/judge.ts already existed from Plan 04-01**
- **Plan 04-02 spec:** "Create src/ai/judge.ts" as Task 2
- **Reality:** Plan 04-01 created this file as a Rule 2 deviation (types.ts required the module to exist for type-only imports at compile time)
- **Action:** Verified file satisfies all requirements (AIJudge, JudgeContext, createAnthropicJudge), skipped creation, only extended tsup.config.ts
- **Impact:** Task 2 scope reduced to tsup.config.ts only — no negative impact on correctness

## Known Stubs

None — all implementations are complete for this plan's scope.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: DoS-mitigated | src/ast.ts | parseSource() wraps parse() in try/catch per T-04-04; malformed input returns null, never crashes proctor |

T-04-04 disposition is `mitigate` — confirmed implemented correctly in `src/ast.ts`.

T-04-02 (API key disclosure) — confirmed mitigated in `src/ai/judge.ts` (pre-existing from Plan 04-01). API key passed as constructor arg, never logged to stderr.

## Self-Check

### Files Exist
- [x] `src/ast.ts` — parseSource() singleton wrapper
- [x] `tests/ast.test.ts` — 7 tests, all pass
- [x] `tsup.config.ts` — dual entry, external SDK

### dist/ Artifacts
- [x] `dist/cli.js` — 21.10 KB
- [x] `dist/ai/judge.js` — 639 B (SDK external confirmed by small file size)

### Commits Exist
- [x] f2bead5 — test(04-02): add failing AST singleton tests (RED)
- [x] c8cdfab — feat(04-02): create src/ast.ts singleton AST wrapper (GREEN)
- [x] 19cbed3 — feat(04-02): extend tsup.config.ts for dual entry and external SDK

### Verification Results
- [x] `npm test -- tests/ast.test.ts` → 7/7 tests pass
- [x] `npm run build` → exits 0, emits dist/cli.js + dist/ai/judge.js
- [x] `npx tsc --noEmit` → exits 0
- [x] `dist/ai/judge.js` size 639B (SDK not bundled)
- [x] `src/ai/judge.ts` contains: export interface AIJudge, export function createAnthropicJudge

## Self-Check: PASSED
