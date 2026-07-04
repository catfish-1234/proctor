---
phase: 02-core-rules-cli
plan: "02"
subsystem: signatures
tags: [rh001, rh002, test-deletion, assertion-weakening, signatures]
dependency_graph:
  requires: []
  provides: [rh001, rh002]
  affects: [src/signatures/index.ts]
tech_stack:
  added: []
  patterns: [pure-function-signature, hunk-level-correlation, fixture-tdd]
key_files:
  created:
    - src/signatures/rh001.ts
    - src/signatures/rh002.ts
    - tests/signatures/rh001.test.ts
    - tests/signatures/rh002.test.ts
  modified: []
decisions:
  - "D-04: file.deleted path uses basename in message, full path in Finding.file"
  - "D-05: test-function del uses change.ln (old-file line) for Finding.line"
  - "D-06: rename-drop path uses line 1 (no line context available)"
  - "RH002 line from add-change.ln (new-file line), not del-change.ln"
metrics:
  duration: "~5 minutes"
  completed: "2026-07-04T02:34:43Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 02 Plan 02: RH001 + RH002 Signatures Summary

RH001 (test deletion, three paths) and RH002 (hunk-level assertion weakening) implemented as pure functions passing fixture ground truth.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | rh001 — test deletion (3 paths) | d8deb80 | src/signatures/rh001.ts, tests/signatures/rh001.test.ts |
| 2 | rh002 — weakened assertion | 6f72b7a | src/signatures/rh002.ts, tests/signatures/rh002.test.ts |

## What Was Built

**rh001** detects three test-deletion patterns:
1. Whole file deleted (`file.deleted && isTestFile(from)`) — line 1
2. Rename drops test extension (`isTestFile(from) && !isTestFile(to)`) — line 1
3. Individual test function deleted via regex on del-line (`it|test|describe` or `def test_`) — line = change.ln

**rh002** detects assertion weakening at hunk level: for each del matching a strong-assertion pattern, find the first add in the same chunk matching a weak-assertion pattern. Finding.line comes from add-change.ln (new-file line number). Message format matches fixture ground truth exactly: `"Assertion weakened from toBe(3) to toBeDefined()."`.

## Test Results

- 52 tests total, all passing (no regressions)
- `npm run typecheck` exits 0
- rh001 fixture test: normalised finding matches expected.json (ruleId RH001, file calculator.test.ts, line 5)
- rh002 fixture test: normalised finding matches expected.json (ruleId RH002, file calculator.test.ts, line 6)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. Both functions are pure (no I/O). The regex patterns in rh002 are all linear-time (no catastrophic backtracking) as required by T-02-03.

## Self-Check: PASSED

- src/signatures/rh001.ts: exists
- src/signatures/rh002.ts: exists
- tests/signatures/rh001.test.ts: exists
- tests/signatures/rh002.test.ts: exists
- Commit d8deb80: confirmed
- Commit 6f72b7a: confirmed
