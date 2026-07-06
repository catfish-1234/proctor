---
phase: 04-ast-layer-subtle-rules
plan: 04
subsystem: signatures-ai-gated
tags: [rh004, rh005, ai-judge, async, tdd, heuristic]
dependency_graph:
  requires: [04-02]
  provides: [rh004, rh005]
  affects: [src/signatures/rh004.ts, src/signatures/rh005.ts, tests/signatures/rh004.test.ts, tests/signatures/rh005.test.ts]
tech_stack:
  added: []
  patterns:
    - "Two-phase AI gate: heuristic always runs, reports [] without aiEnabled (D-11)"
    - "Cross-file literal matching via LITERAL_RE + extractLiterals (D-12 for RH004)"
    - "Body-shrink heuristic with GUTTED_RE/EMPTY_BODY_RE patterns (D-13 for RH005)"
    - "Async signature returning Promise<Finding[]> — first async signatures in codebase"
    - "TDD RED/GREEN cycle for both signatures"
key_files:
  created:
    - src/signatures/rh004.ts
    - src/signatures/rh005.ts
    - tests/signatures/rh004.test.ts
    - tests/signatures/rh005.test.ts
decisions:
  - "rh004 heuristic scans add+del from test files but add-only from impl files (D-12)"
  - "rh005 skips test files entirely per D-13 (impl-only gutted function detection)"
  - "AI gate placed AFTER heuristic collection but BEFORE judge calls — silent candidate collection without reporting"
  - "Both signatures use async/await pattern returning Promise<Finding[]> (consistent with rh008 from plan 04-03)"
metrics:
  duration: "~6 minutes"
  completed: "2026-07-06T04:20:30Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 4 Plan 4: RH004 + RH005 AI-Gated Signatures Summary

Implement RH004 (implementation hardcoding detection) and RH005 (gutted function detection) — both async signatures with two-phase design: diff-level heuristic runs always, AI judge called only when `ctx.aiEnabled` is true.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 (RED) | Failing tests for rh004 | 69889fc | Complete |
| 1 (GREEN) | Create src/signatures/rh004.ts | d840093 | Complete |
| 2 (RED) | Failing tests for rh005 | a329398 | Complete |
| 2 (GREEN) | Create src/signatures/rh005.ts | 3d5bd7f | Complete |

## What Was Built

**`src/signatures/rh004.ts` — Implementation hardcoding detection (new file):**
- `async function rh004(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]>`
- LITERAL_RE: `/(?:["'\`])([^"'\`\n]+?)(?:["'\`])|(?<!\w)(\d+(?:\.\d+)?)(?!\w)/g` — extracts string and number literals
- `extractLiterals(line: string): Set<string>` — iterates matchAll, collects all literal values
- D-12 heuristic: collects add-only literals from impl files; add+del literals from test files
- AI gate (D-11): candidates built silently; `if (!ctx.aiEnabled || !ctx.judge) return []`
- For each matching candidate, calls `ctx.judge.judge({ ruleId: 'RH004', ... })` and pushes finding on confirmation
- Finding: `severity: 'error'`, message describes hardcoded literal match

**`tests/signatures/rh004.test.ts` — 5 tests covering SIG-05:**
- `aiEnabled=false` returns `[]` even with matching literals
- `judge=true` + cross-file literal match returns 1 finding with `ruleId=RH004`, `severity=error`
- `judge=false` returns `[]`
- Impl literal `42` with no matching test literal returns `[]` (heuristic gate)
- Test-file-only diff returns `[]` (no impl side for cross-file match)

**`src/signatures/rh005.ts` — Gutted function detection (new file):**
- `async function rh005(files: ParsedFile[], ctx: RepoContext): Promise<Finding[]>`
- GUTTED_RE: `/^\+\s*(?:return\s+(?:null|undefined|None)|pass)\s*;?\s*$/` — matches gutted returns
- EMPTY_BODY_RE: `/^\+\s*\{\s*\}\s*$/` — matches empty function body
- D-13 heuristic: skips test files (impl-only); requires dels.length > adds.length (body shrinks); requires at least one add matching GUTTED_RE or EMPTY_BODY_RE
- AI gate (D-11): candidates built silently; `if (!ctx.aiEnabled || !ctx.judge) return []`
- For each candidate, calls `ctx.judge.judge({ ruleId: 'RH005', ... })` with excerpt of del+add lines
- Finding: `severity: 'error'`, message describes gutted body

**`tests/signatures/rh005.test.ts` — 6 tests covering SIG-06:**
- `aiEnabled=false` returns `[]` even with body-shrink candidates
- `judge=true` + body shrink with `return null` returns 1 finding with `ruleId=RH005`, `severity=error`
- Body grows (more adds than dels) returns `[]` (heuristic gate)
- Test file skipped (D-13): gutted test file returns `[]`
- Add is real return value (not null/undefined/pass) returns `[]` (heuristic gate)
- `judge=false` returns `[]`

## TDD Gate Compliance

| Gate | Commit | Satisfied |
|------|--------|-----------|
| RED (rh004) | 69889fc — `test(04-04): add failing tests for rh004 implementation hardcoding detection (RED)` | Yes |
| GREEN (rh004) | d840093 — `feat(04-04): implement rh004 implementation hardcoding detection (GREEN)` | Yes |
| RED (rh005) | a329398 — `test(04-04): add failing tests for rh005 gutted function detection (RED)` | Yes |
| GREEN (rh005) | 3d5bd7f — `feat(04-04): implement rh005 gutted function detection (GREEN)` | Yes |

## Deviations from Plan

None — plan executed exactly as written.

Both signatures follow the pattern from PATTERNS.md exactly. The D-11/D-12/D-13 heuristics are implemented per specification. Tests use hand-crafted ParsedFile stubs (not fixtureDiff), as specified.

## Pre-existing Test Failures (Out of Scope)

The full test suite shows 14 pre-existing failures in `tests/cli.test.ts` and 1 in `tests/pre-classifier.test.ts`. These failures exist before any plan 04-04 changes (verified by running tests with no local changes). They are outside the scope of this plan:

- `tests/cli.test.ts`: CLI smoke tests fail because `dist/cli.js` does not exist in the worktree (no build run in this worktree). These require a build step handled by a later plan.
- `tests/pre-classifier.test.ts`: `mode-only` test expects `'mode-only'` but receives `'rename-only'` — a fixture/classifier mismatch not introduced by this plan.

All 38 signature tests pass. All 7 AST tests pass. No regressions from plan 04-04 changes.

## Known Stubs

None — both implementations are complete for this plan's scope.

## Threat Flags

No new security-relevant surface introduced. RH004 and RH005 are pure diff-based heuristics with AI judge confirmation. Diff excerpts are passed as string to the judge (no code execution). The AI gate is a boolean gate — no data exfiltration possible.

T-04-07 (DoS via LITERAL_RE catastrophic backtracking): Regex operates on individual diff lines (bounded length); accepted as-is per threat model.
T-04-08 (Prompt injection via diffExcerpt): diffExcerpt is a string in user message body; judge returns boolean only. Accepted per threat model.

## Self-Check

### Files Exist
- [x] `src/signatures/rh004.ts` — async rh004 with LITERAL_RE, extractLiterals, D-11/D-12
- [x] `tests/signatures/rh004.test.ts` — 5 tests, all pass
- [x] `src/signatures/rh005.ts` — async rh005 with GUTTED_RE, EMPTY_BODY_RE, D-11/D-13
- [x] `tests/signatures/rh005.test.ts` — 6 tests, all pass

### Verification Results
- [x] `npm test -- tests/signatures/rh004.test.ts` → 5/5 tests pass
- [x] `npm test -- tests/signatures/rh005.test.ts` → 6/6 tests pass
- [x] `npm test -- tests/signatures/` → 38/38 tests pass (all signature tests)
- [x] Both signatures are async (return `Promise<Finding[]>`)
- [x] Neither calls `readFileSync` or any I/O (pure diff-based heuristics)
- [x] Both return `[]` when `ctx.aiEnabled` is false

### Commits Exist
- [x] 69889fc — test(04-04): add failing tests for rh004 implementation hardcoding detection (RED)
- [x] d840093 — feat(04-04): implement rh004 implementation hardcoding detection (GREEN)
- [x] a329398 — test(04-04): add failing tests for rh005 gutted function detection (RED)
- [x] 3d5bd7f — feat(04-04): implement rh005 gutted function detection (GREEN)

## Self-Check: PASSED
