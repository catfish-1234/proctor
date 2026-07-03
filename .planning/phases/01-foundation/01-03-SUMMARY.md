---
phase: 01-foundation
plan: "03"
subsystem: diff-parsing
tags: [parse-diff, spawnSync, pre-classifier, diff]

requires:
  - phase: 01-02
    provides: types.ts (Finding, RepoContext, ProctorConfig) needed for pre-classifier exports

provides:
  - "src/diff.ts: runGitDiff spawnSync wrapper + ParsedFile re-export"
  - "src/pre-classifier.ts: classifyDiff with 5-check pipeline (6 rejection reasons)"
  - "tests/diff.test.ts: 4 vitest tests for parseDiff"
  - "tests/pre-classifier.test.ts: 8 vitest tests for all rejection types"

affects: [01-04, 01-05, phase-02-core-rules]

tech-stack:
  added: []
  patterns:
    - "ParsedFile = ReturnType<typeof parseDiff>[number] — avoids re-declaring parse-diff's types"
    - "Binary detection from raw section text since parse-diff does not expose a .binary field"
    - "Per-file section split: raw.split(/^(?=diff --git )/m) for binary detection"
    - "Inline fallback diff strings in tests — try/catch for fixture files created in Plan 05"

key-files:
  created:
    - src/diff.ts
    - src/pre-classifier.ts
    - tests/diff.test.ts
    - tests/pre-classifier.test.ts
  modified: []

key-decisions:
  - "ParsedFile exported as ReturnType<typeof parseDiff>[number] not via named import (export= module)"
  - "Binary detection uses raw section scanning not file.binary (field does not exist in parse-diff 0.12.0)"
  - "mode-only check adds !file.deleted && !file.new guard to avoid false-rejecting empty deleted/new files"

patterns-established:
  - "classifyDiff: pure function (raw: string, files: ParsedFile[]) => ClassificationResult — no I/O"
  - "Rejection pipeline: combined-diff (raw, global) -> binary (raw, per-section) -> mode-only -> submodule -> rename-only"
  - "Test inline fallbacks: fixture files optional via try/catch so parallel Plan 05 is not a hard dependency"

requirements-completed: [FOUND-02, FOUND-03]

duration: 15min
completed: "2026-07-03"
---

# Phase 1 Plan 03: Diff Parser and Pre-classifier Summary

**spawnSync git diff wrapper with CRLF normalization and 5-check pre-classifier rejecting binary, mode-only, submodule, combined, and rename-only diffs**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03T12:49:00Z
- **Completed:** 2026-07-03T13:00:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `runGitDiff` wraps `spawnSync('git', ['diff', ...args])` with args-array form (no shell injection, T-1-06) and CRLF normalization before `parseDiff`
- `classifyDiff` implements 5-check pipeline rejecting all 6 non-analyzable diff types; combined-diff caught from raw string before per-file checks
- Binary detection via raw section text -- discovered parse-diff 0.12.0 does NOT expose a `.binary` field despite research document claiming it does
- All 12 vitest tests pass with inline fallback strings so tests are independent of Plan 05 fixtures

## Task Commits

1. **Task 1: Implement src/diff.ts and src/pre-classifier.ts** - `95218bc` (feat)
2. **Task 2: Write vitest unit tests for diff parser and pre-classifier** - `00b351f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/diff.ts` -- `runGitDiff` + `ParsedFile` type re-export
- `src/pre-classifier.ts` -- `classifyDiff` + `ClassificationResult` interface
- `tests/diff.test.ts` -- 4 tests for `parseDiff` with inline unified diff strings
- `tests/pre-classifier.test.ts` -- 8 tests covering all 6 rejection reasons + mixed diff case

## Decisions Made

- Used `ReturnType<typeof parseDiff>[number]` as `ParsedFile` rather than `import type { File }` -- `export = parseDiff` in parse-diff makes named type imports unreliable with NodeNext module resolution
- Binary detection from raw text sections (`raw.split(/^(?=diff --git )/m)`) instead of `file.binary` -- the field does not exist in the actual library source; RESEARCH.md section 4 was incorrect on this point
- Added `!file.deleted && !file.new` guard to mode-only check for correctness -- prevents false rejection of empty deleted/new files that happen to have a mode field set

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Binary detection via raw sections, not file.binary**
- **Found during:** Task 1 (implementing pre-classifier)
- **Issue:** Plan specified `file.binary === true` but parse-diff 0.12.0 parse.js source and index.d.ts contain no `binary` property. Binary diffs produce a File with empty chunks and no flag.
- **Fix:** Split raw diff by `diff --git` headers into per-file sections; check each section for `^Binary files ` or `^GIT binary patch` patterns.
- **Files modified:** src/pre-classifier.ts
- **Verification:** node -e test confirmed parse-diff output; vitest binary test passes with inline binary diff string.
- **Committed in:** `95218bc` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added !file.deleted && !file.new guard to mode-only check**
- **Found during:** Task 1 (implementing pre-classifier)
- **Issue:** Plan's mode-only check `chunks.length === 0 && (oldMode !== undefined || newMode !== undefined)` would incorrectly reject empty deleted/new files which also carry mode fields.
- **Fix:** Added `&& !file.deleted && !file.new` to the condition.
- **Files modified:** src/pre-classifier.ts
- **Verification:** Confirmed parse-diff sets `deleted: true` with `oldMode` for deleted files; guard prevents false rejection.
- **Committed in:** `95218bc` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing correctness guard)
**Impact on plan:** Both fixes required for correct behavior. No scope creep. All plan acceptance criteria still met.

## Issues Encountered

- Worktree had no `node_modules` (not tracked by git). Created a junction link (`mklink /J`) to main repo's `node_modules` so vitest and tsc could run from the worktree directory.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `runGitDiff` and `classifyDiff` are ready for consumption by signature checks in Phase 2
- `ParsedFile` type is available for import in all downstream modules
- Pre-classifier fixture files (`fixtures/preclass/*.diff`) are created in Plan 05; tests fall back to inline strings until then
- No blockers

---
*Phase: 01-foundation*
*Completed: 2026-07-03*
