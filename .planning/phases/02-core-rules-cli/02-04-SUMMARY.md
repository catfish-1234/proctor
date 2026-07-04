---
phase: 02-core-rules-cli
plan: "04"
subsystem: engine
tags: [engine, suppression, ignore-patterns, severity-overrides, signatures]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides: [runChecks, Signature type, signatures registry]
  affects: [src/engine.ts, src/signatures/index.ts]
tech_stack:
  added: []
  patterns: [flatMap-filter pipeline, endsWith path normalization, micromatch glob matching]
key_files:
  created: [src/engine.ts, tests/engine.test.ts]
  modified: [src/signatures/index.ts]
decisions:
  - applySuppression is private (not exported); all 7 cases testable via runChecks with crafted ParsedFile stubs
  - endsWith path matching used for both directions (fp.endsWith(ff) || ff.endsWith(fp)) to handle absolute vs relative mismatches
  - suppress comment requires non-empty reason: text; absent or empty reason keeps the finding
metrics:
  duration: "~5 minutes"
  completed: "2026-07-03"
  tasks_completed: 2
  files_changed: 3
---

# Phase 02 Plan 04: Engine Dispatcher Summary

Typed Signature registry in `signatures/index.ts` and `engine.ts` with `runChecks`, inline suppression, ignore pattern filtering, and severity overrides.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Typed Signature registry | 5c311e2 | src/signatures/index.ts |
| 2 (RED) | Failing engine tests | 694c125 | tests/engine.test.ts |
| 2 (GREEN) | Engine dispatcher | a6a35a3 | src/engine.ts |

## What Was Built

**`src/signatures/index.ts`** — replaced `unknown[]` placeholder with:
- `Signature` type: `(files: ParsedFile[], ctx: RepoContext) => Finding[]`
- `signatures: Signature[]` array with `[rh001, rh002, rh003, rh007]`

**`src/engine.ts`** — `runChecks` pipeline:
1. `flatMap` all signatures, filter by `ctx.enabled`
2. `applySuppression` — scans diff changes for `proctor-ignore: RULEXX reason: <text>` at `finding.line - 1`; suppresses only when both ruleId matches and reason is non-empty
3. `applyIgnorePatterns` — `micromatch.isMatch` on `ctx.ignorePatterns`
4. `applySeverityOverrides` — spreads `ctx.severity[ruleId]` override per finding

**`tests/engine.test.ts`** — 7 tests covering all post-processing steps using real signatures + crafted `ParsedFile` stubs.

## Test Results

- 7 new engine tests: all pass
- Full suite: 68/68 passing (up from 61)
- `npm run typecheck`: clean
- `npm run build`: clean

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or auth paths introduced.

## Self-Check: PASSED

- `src/engine.ts`: EXISTS
- `src/signatures/index.ts`: EXISTS (modified)
- `tests/engine.test.ts`: EXISTS
- Commits 5c311e2, 694c125, a6a35a3: all present in git log
