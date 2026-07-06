---
phase: 04-ast-layer-subtle-rules
plan: 03
subsystem: signatures
tags: [rh006, rh002, rh003, python, snapshot, tdd, phase4-wave2]
dependency_graph:
  requires: [04-01]
  provides: [src/signatures/rh006.ts, rh003-pytest-skipif, rh002-assertAlmostEqual]
  affects: [src/signatures/rh006.ts, src/signatures/rh002.ts, src/signatures/rh003.ts, tests/signatures/rh006.test.ts, tests/signatures/rh002.test.ts, tests/signatures/rh003.test.ts]
tech_stack:
  added: []
  patterns:
    - "micromatch.isMatch() for snapshot glob path matching"
    - "Keyword regex suppression on ctx.commitMessage"
    - "TDD RED/GREEN cycle for rh006 (7 failing tests before implementation)"
    - "assertAlmostEqual places= reduction detection via chunk-level del/add pairing"
decisions:
  - "snapshotGlobs tight to ['**/__snapshots__/*.snap'] in tests to avoid Pitfall 7 (fixture path collision)"
  - "ALMOST_EQUAL tolerance-widening check runs after existing STRONG→WEAK loop in rh002 (separate del iteration)"
  - "buildSkipMessage PYTEST_SKIPIF check ordered before UNITTEST_SKIP per specificity"
key_files:
  created:
    - src/signatures/rh006.ts
    - tests/signatures/rh006.test.ts
  modified:
    - src/signatures/rh002.ts
    - tests/signatures/rh002.test.ts
    - src/signatures/rh003.ts
    - tests/signatures/rh003.test.ts
metrics:
  duration: "~5 minutes"
  completed: "2026-07-06T04:12:59Z"
  tasks_completed: 2
  files_changed: 6
---

# Phase 4 Plan 3: RH006 Snapshot Detection + Python Regex Extensions Summary

RH006 snapshot rewrite detection (glob match + commit message keyword suppression), extension of RH003 to catch `@pytest.mark.skipif`, and extension of RH002 to detect Python `assertAlmostEqual` tolerance-widening — all implemented as pure diff-analysis signatures with no AST or AI required.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 (RED) | Failing tests for rh006 | aafea89 | Complete |
| 1 (GREEN) | rh006 implementation | 5519205 | Complete |
| 2 | rh003 @pytest.mark.skipif + rh002 assertAlmostEqual | 687f9df | Complete |

## What Was Built

**`src/signatures/rh006.ts` — New file:**
- `DEFAULT_SNAPSHOT_GLOBS`: `['**/__snapshots__/*.snap', '**/*.snap.ts', '**/golden/**', '**/__fixtures__/**']`
- `REASON_KEYWORDS`: `/snap|snapshot|golden|regenerat|intentional|expected|by design/i` (D-10)
- Function `rh006(files, ctx)`: uses `micromatch.isMatch()` for path matching, returns `[]` when commit message contains a reason keyword
- Severity: `warn` (not `error`) per SIG-07 spec
- Windows path normalization: `.replace(/\\/g, '/')` before micromatch call

**`tests/signatures/rh006.test.ts` — New file:**
- 7 tests covering: snapshot path triggers warn finding, keyword suppression (regenerate, intentional), non-keyword commit still fires, non-snapshot path returns `[]`, custom `snapshotGlobs` exclusion, default globs include `__fixtures__/`
- Uses tight `snapshotGlobs: ['**/__snapshots__/*.snap']` in ctx to avoid Pitfall 7 (fixture path collision)

**`src/signatures/rh003.ts` — Extended:**
- Added `PYTEST_SKIPIF = /@pytest\.mark\.skipif\b/` constant after `PYTEST_SKIP`
- Added `PYTEST_SKIPIF.test(content)` to `isSkipPattern()` return
- Added message to `buildSkipMessage()`: `'Test was conditionally disabled with @pytest.mark.skipif.'`
- Closes AST-03 gap: `@pytest.mark.skipif` (condition-based skip) was previously undetected

**`tests/signatures/rh003.test.ts` — Extended:**
- 1 new test: `@pytest.mark.skipif(sys.version_info < (3, 8), reason="old python")` on added line produces RH003 error finding
- All 5 pre-existing tests unchanged and passing

**`src/signatures/rh002.ts` — Extended:**
- Added `ALMOST_EQUAL = /assertAlmostEqual\(/` constant after `WEAK_PATTERNS`
- Added second loop in chunk body: detects dels matching `assertAlmostEqual` and finds adds that either (a) replace with a weak assertion or (b) use `assertAlmostEqual` with a lower `places=` value
- Finding: `ruleId: 'RH002', severity: 'error', message: 'Assertion weakened from assertAlmostEqual to a less precise check.'`

**`tests/signatures/rh002.test.ts` — Extended:**
- New describe block `RH002 Python tolerance-widening` with 3 tests:
  1. `assertAlmostEqual(..., places=5)` → `assertTrue(result > 3)` fires RH002
  2. `assertAlmostEqual(..., places=4)` → `assertAlmostEqual(..., places=2)` fires RH002 (places reduced)
  3. `assertAlmostEqual(..., places=2)` → `assertAlmostEqual(..., places=5)` returns `[]` (stricter — not weaker)
- All 3 pre-existing tests unchanged and passing

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all implementations are complete for this plan's scope.

## Threat Flags

None — no new network endpoints or trust boundary crossings. RH006's snapshot glob matching is allowlist-based (files must match to produce a finding); `ctx.commitMessage` is the git subject line (public to all repo contributors per T-04-06).

## Out-of-Scope Pre-existing Failures

Two pre-existing test failures exist in the repo but are unrelated to this plan (same as documented in 04-01 SUMMARY):
1. `tests/cli.test.ts` — 13 tests fail because `dist/cli.js` is not built in this worktree (gitignored)
2. `tests/pre-classifier.test.ts` — 1 test fails (`rejects mode-only diff`) — confirmed pre-existing

Additionally, `npx tsc --noEmit` errors on `@anthropic-ai/sdk` and `@typescript-eslint/typescript-estree` because these packages were installed during Plan 04-01's run but are not in the accessible `node_modules` path for this worktree. This is a pre-existing condition unaffected by this plan's changes.

## Self-Check

### Files Exist
- [x] `src/signatures/rh006.ts` — new file with `REASON_KEYWORDS` and `DEFAULT_SNAPSHOT_GLOBS`
- [x] `tests/signatures/rh006.test.ts` — 7 tests all passing
- [x] `src/signatures/rh003.ts` — contains `PYTEST_SKIPIF = /@pytest\.mark\.skipif\b/`
- [x] `tests/signatures/rh003.test.ts` — 6 tests all passing (1 new + 5 pre-existing)
- [x] `src/signatures/rh002.ts` — contains `ALMOST_EQUAL` constant and tolerance-widening loop
- [x] `tests/signatures/rh002.test.ts` — 6 tests all passing (3 new + 3 pre-existing)

### Commits Exist
- [x] aafea89 — test(04-03): add failing rh006 tests (RED)
- [x] 5519205 — feat(04-03): implement rh006 snapshot rewrite detection (GREEN)
- [x] 687f9df — feat(04-03): extend rh003 with @pytest.mark.skipif and rh002 with assertAlmostEqual

### Verification
- [x] `npm test -- tests/signatures/rh006.test.ts` exits 0 (7/7 pass)
- [x] `npm test -- tests/signatures/rh002.test.ts` exits 0 (6/6 pass)
- [x] `npm test -- tests/signatures/rh003.test.ts` exits 0 (6/6 pass)
- [x] `src/signatures/rh003.ts` contains: `PYTEST_SKIPIF = /@pytest\.mark\.skipif\b/`
- [x] `src/signatures/rh006.ts` contains: `REASON_KEYWORDS` and `DEFAULT_SNAPSHOT_GLOBS`
- [x] `npm test` — 83 pass / 14 fail (failures are pre-existing, unrelated to this plan)

## Self-Check: PASSED
