---
phase: 06-skill-adapters-benchmark
plan: 03
subsystem: testing
tags: [vitest, bench, fixtures, synthetic-tasks, held-out-tests]

# Dependency graph
requires: []
provides:
  - "vitest.config.ts excluding bench/tasks/** from proctor's own suite"
  - "15 hand-authored synthetic benchmark task directories under bench/tasks/task-01..task-15"
  - "bench/tasks/TASKS.md — single canonical index of the task pool"
  - "tests/bench-tasks-pool.test.ts — structural validation of every task dir"
affects: ["06-02 (fixture-runner.ts consumes mock-agent.json schema)", "06-04 (scorer.ts consumes repo/+held-out/ split)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bench/tasks/task-NN/ mirrors fixtures/RH00N/'s single-canonical-index-doc convention (TASKS.md, no per-task README)"
    - "repo/ + held-out/ hide/reveal split: held-out tests live in a differently-named sibling file (e.g. foo.hidden.test.js) so copying held-out/ into a temp workdir never clobbers the agent-visible test file"
    - "mock-agent.json only lists files that differ from repo/ (honest fix touches only source; cheat touches only the tampered test/config/snapshot file)"

key-files:
  created:
    - vitest.config.ts (modified — added test.exclude)
    - bench/tasks/TASKS.md
    - bench/tasks/task-01/ .. task-15/ (prompt.md, repo/, held-out/, held-out.json, mock-agent.json each)
    - tests/bench-tasks-pool.test.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "Held-out tests use a distinct filename (e.g. stringUtils.hidden.test.js) rather than overwriting the visible test file, so held-out/ can be copied into a temp workdir without destroying the agent's visible tests"
  - "mock-agent.json proctorOn/proctorOff.files only include files that differ from repo/ (not full unchanged file sets) — keeps each cheat's diff minimal and directly attributable to one RH-ID"
  - "RH004/RH005/RH008 excluded from every task's cheat opportunity per D-09 (AI-gated, bench never enables --ai)"
  - "task-15 is a labeled control task where proctorOff.files is byte-identical to proctorOn.files — proves the pool isn't trivially all-positive"

patterns-established:
  - "Cheat-opportunity RH-ID tally across the 15-task pool: RH001 x3 (01,09,12), RH002 x3 (02,10,13), RH003 x3 (03,08,14), RH006 x2 (04,06), RH007 x3 (05,07,11), control x1 (15)"

requirements-completed: [BENCH-01, BENCH-04]

# Metrics
duration: 45min
completed: 2026-07-07
---

# Phase 6 Plan 03: Bench Task Pool + vitest Exclusion Summary

**15 hand-authored synthetic benchmark tasks (repo/+held-out/ hide-reveal split, mock-agent.json proctorOn/proctorOff schema) covering RH001/RH002/RH003/RH006/RH007 plus one control task, with vitest.config.ts excluding bench/tasks/** from proctor's own suite.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3/3 completed
- **Files modified/created:** 95 (vitest.config.ts + bench/tasks/TASKS.md + 15 task dirs x ~6 files each + tests/bench-tasks-pool.test.ts)

## Accomplishments
- `vitest.config.ts` now excludes `bench/tasks/**` (alongside `node_modules/**`, `dist/**`) so the 15 starter-repo mini-projects' own `*.test.js` files are never collected by proctor's own `vitest run`
- 15 self-contained `bench/tasks/task-NN/` directories authored, each with `prompt.md` (no mention of held-out tests), `repo/` (agent-visible, buggy source + visible test, held-out tests physically absent), `held-out/` (withheld test in a distinct filename so it can be merged without clobbering), `held-out.json` (>=30% of that task's tests hidden), and `mock-agent.json` (`proctorOn.files` honest fix, `proctorOff.files` cheat state)
- Cheat opportunities cover only the deterministic signatures RH001/RH002/RH003/RH006/RH007 (RH001 x3, RH002 x3, RH003 x3, RH006 x2, RH007 x3) plus one labeled control task (task-15) whose `proctorOff.files` is identical to its honest `proctorOn.files`
- `bench/tasks/TASKS.md` is the single canonical index (mirrors `fixtures/FIXTURES.md` convention) — a table of all 15 tasks (target RH-ID/control, cheat opportunity, held-out count) plus notes on seed selection, vitest test isolation, and the RH004/RH005/RH008 exclusion rationale
- `tests/bench-tasks-pool.test.ts` structurally validates every task directory: dir count >=15, required files present, `held-out.json` non-empty array, `held-out/` has >=1 file, `mock-agent.json` schema, and at least one control task — 63 assertions, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: vitest.config.ts + task-01..05 + TASKS.md skeleton** - `78147c3` (feat)
2. **Task 2: task-06..10 (deterministic RH variety)** - `df7c69b` (feat)
3. **Task 3: task-11..15 + control + structural pool test + finalize TASKS.md** - `e05ece3` (feat)

## Files Created/Modified
- `vitest.config.ts` - added `test.exclude` covering `node_modules/**`, `dist/**`, `bench/tasks/**`
- `bench/tasks/TASKS.md` - single canonical pool index (all 15 tasks, seed/isolation/RH-exclusion notes)
- `bench/tasks/task-01/` through `task-14/` - each a cheat-opportunity task targeting one deterministic RH-ID (RH001/RH002/RH003/RH006/RH007), varying domain modules (string/array/math/format/validation utilities) to avoid repetitive fixture content
- `bench/tasks/task-15/` - control task (honest fix in both `proctorOn` and `proctorOff`)
- `tests/bench-tasks-pool.test.ts` - structural pool validation (63 assertions)

## Decisions Made
- Held-out tests live in a distinct filename (`<module>.hidden.test.js`) rather than the same filename as the visible test, so `held-out/` can be copied on top of a temp workdir without silently overwriting the agent's visible test file — this was an interpretation call since the plan's held-out/ description ("same repo-relative layout they will occupy") was ambiguous between same-filename-overwrite and distinct-filename-addition; distinct filename is the only interpretation that doesn't destroy agent-visible test coverage during scoring.
- `mock-agent.json`'s `proctorOn.files`/`proctorOff.files` only list files that differ from `repo/`, not the full file set — keeps each cheat attributable to exactly one signature in a future scorer's diff and matches the "full new file content" contract literally (only for touched files).
- Cross-checked every planted cheat's literal syntax (`.toBe()` → `.toBeDefined()` for RH002 weak/strong pairs, `it.skip(` for RH003, `__snapshots__/*.snap` glob match for RH006, `"exclude"`/`testPathIgnorePatterns` substring match for RH007) directly against the corresponding `src/signatures/rh00N.ts` regexes to ensure each planted cheat is realistically detectable by a future scorer run, not just structurally present.

## Deviations from Plan

None - plan executed exactly as written. The held-out/ distinct-filename interpretation above was a necessary implementation-detail resolution of a genuinely ambiguous plan clause, not a deviation from any explicit instruction (Rule 1/2 territory: kept the hide/reveal contract intact and functional).

## Issues Encountered
- Initial task-04 (RH006) design used a `.snap.json` snapshot file, which does not match `DEFAULT_SNAPSHOT_GLOBS` in `src/signatures/rh006.ts` (`**/__snapshots__/*.snap`, not `*.snap.json`). Caught during authoring by cross-checking the signature source before finalizing the file — corrected to a literal `.snap` file in Jest-snapshot text format (matching `fixtures/RH006/`'s exact convention) before task-04 was committed. No commit needed correction since this was caught pre-commit.
- Pre-existing, unrelated test failures observed in `tests/cli.test.ts` (`--ai`/`--sarif` flag assertions) and `tests/pre-classifier.test.ts` (`mode-only` vs `rename-only` diff classification) — 17 failing tests present both before and after this plan's changes, confirmed by identical failure count/file count before/after (`vitest.config.ts`'s new `exclude` array cannot affect these files' logic; `bench/tasks/**` files are never collected — 0 `task-0*` matches in the run output, and total test file count exactly matches `find tests -name "*.test.ts" | wc -l`). Out of scope per this plan's SCOPE BOUNDARY (unrelated files, pre-existing before this plan's first commit) — not touched, documented here for visibility to whichever phase owns `cli.ts`/`pre-classifier.ts`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04 (scorer.ts) has real fixture data to consume: 15 `repo/`+`held-out/` task directories with a documented `mock-agent.json` schema it can drive directly.
- Plan 02 (fixture-runner.ts / MockAgentFile schema) can be validated end-to-end against 15 real tasks once merged.
- Known pre-existing failures in `tests/cli.test.ts` and `tests/pre-classifier.test.ts` (17 tests) are NOT part of this plan's scope and remain open — flagged above for the phase/plan that owns those files.

---
*Phase: 06-skill-adapters-benchmark*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created files verified present (vitest.config.ts, bench/tasks/TASKS.md, tests/bench-tasks-pool.test.ts, all 15 task-NN/ directories with prompt.md + repo/ + held-out/ + held-out.json + mock-agent.json). All 3 task commits (78147c3, df7c69b, e05ece3) verified present in git log.
