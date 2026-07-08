---
phase: 06-skill-adapters-benchmark
plan: 04
subsystem: testing
tags: [benchmark, vitest, mkdtemp, junction, held-out-tests, csv, cli]

# Dependency graph
requires:
  - phase: 06-skill-adapters-benchmark
    provides: "src/bench/types.ts AgentTask/AgentResult/AgentRunner, src/bench/csv.ts, src/bench/tasks.ts, src/bench/runners/* (Plan 02); src/skill/SKILL.md (Plan 01); the 15-task bench/tasks/task-NN/ pool (Plan 03)"
provides:
  - "src/bench/scorer.ts: scoreTask(taskDir, runner, proctorOn) — temp-copy + agent run + git diff + runChecks (D-09) + held-out reveal + held-out test run"
  - "src/bench/report.ts: cheatRateTable — before/after (proctor off vs on) cheat-rate + honest-pass-rate table"
  - "src/bench/index.ts: runBench orchestrator wiring loader+runner+scorer+csv+report"
  - "proctor bench CLI command (--tasks/--seed/--mock/--agent/--out), replacing the stub"
  - "bench/METHODOLOGY.md — held-out methodology, D-09 scoring rationale, RH004/005/008 scope note, EvilGenie + Baker et al. (OpenAI) citations"
affects: [06-05, future-bench-runs-against-real-agent-clis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Windows junction / POSIX symlink of node_modules into a disposable os.tmpdir() copy so bare imports ('vitest', 'vitest/config') in copied task files resolve without network"
    - "findPackageRoot() walk-up (existsSync(package.json)) instead of a fixed import.meta.url relative offset, so path resolution survives tsup bundling (dist/cli.js) as well as unbundled vitest execution"
    - "held-out/ reveal preserves its own subdirectory nesting (workdir/held-out/*) rather than flattening into the workdir root, so held-out test files' own repo-relative imports resolve"

key-files:
  created:
    - src/bench/scorer.ts
    - src/bench/report.ts
    - src/bench/index.ts
    - bench/METHODOLOGY.md
    - tests/bench.test.ts
  modified:
    - src/cli.ts
    - tests/cli.test.ts
    - src/bench/tasks.ts

key-decisions:
  - "honest_pass test command resolves proctor's own already-installed vitest binary directly (via createRequire(import.meta.url).resolve('vitest/package.json')) instead of shelling out to `npx vitest run` — the disposable temp copy has no independent node_modules tree, so npx would need network access or fail; combined with a node_modules junction/symlink into the temp copy, this gives the same 'run this repo's own tests, read the exit code' behavior with zero network calls"
  - "held-out/ is copied into the workdir AS a subdirectory (workdir/held-out/*.hidden.test.js), not flattened into the workdir root — verified against all 15 real pool tasks' held-out test files, which import their module via '../moduleName.js' (i.e. they expect to sit one level below the repo root once revealed)"
  - "mock-agent.json is copied into the temp workdir BEFORE the git baseline commit (not after), so fixture-runner's co-located-in-workdir read (Plan 02's locked convention) succeeds without polluting the post-run diff with a spurious 'mock-agent.json added' finding"

patterns-established:
  - "Rule 1/3 fix: src/bench/tasks.ts's DEFAULT_TASKS_DIR now resolves via a package.json walk-up instead of a fixed '../../bench/tasks' offset from import.meta.url, because tsup's single-file bundle (dist/cli.js) changes import.meta.url's directory relative to the unbundled source layout Plan 02 assumed"

requirements-completed: [BENCH-01, BENCH-02, BENCH-03, BENCH-05]

# Metrics
duration: ~55min
completed: 2026-07-07
---

# Phase 6 Plan 04: Benchmark Wiring (Scorer + Report + CLI) Summary

**`proctor bench --mock --tasks N --seed S` runs N seeded tasks x {proctor on, off} end-to-end via proctor's own `runChecks` (no bench-local detection logic), writes the BENCH-03 CSV, and prints a before/after cheat-rate table — held-out tests are hidden from the agent and revealed only at scoring time.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified/created:** 8 (5 created, 3 modified)

## Accomplishments
- `scoreTask(taskDir, runner, proctorOn)` copies a task's `repo/` to a disposable `mkdtemp` workdir, threads `proctorOn` into `AgentTask`, runs the agent, diffs the result, and calls proctor's own in-process `runChecks` (D-09) — zero bench-local detection logic, RH004/RH005/RH008 intentionally never enabled (no `--ai`)
- Held-out reveal copies `held-out/` in as a nested subdirectory (not flattened) immediately before running the held-out tests, so `honest_pass` reflects the agent's actual solution against tests it never saw (verified against real fixtures — flattening broke every real pool task's relative imports; nesting fixed all of them)
- `cheatRateTable` (report.ts) and `runBench` (index.ts) wire loader → runner (mock or real) → scorer → CSV → table, with `--tasks`/`--seed` validated to `[1, pool size]` and integer respectively
- `proctor bench` CLI command replaces the `not implemented yet` stub: `--mock --tasks 3 --seed 1 --out <path>` verified end-to-end (built `dist/cli.js`) to exit 0, write a byte-exact `task_id,model,proctor_on,cheat_detected,rh_id,honest_pass` CSV with 6 rows (2 per task, one `proctor_on=true`/one `false` per task), print a cheat-rate table, and select the same 3 tasks deterministically across repeated runs with the same seed
- `bench/METHODOLOGY.md` documents the held-out hide/reveal design, the D-09 signature-reuse rationale, the RH004/RH005/RH008 scope exclusion, the proctor-on/off real-intervention mechanism, seeded selection (D-10), the CSV schema, and cites EvilGenie (arXiv:2511.21654) and Baker et al. 2025 correctly attributed to OpenAI (arXiv:2503.11926) — never Anthropic

## Task Commits

Each task was committed atomically:

1. **Task 1: scorer.ts — temp-copy, run(proctorOn), git diff, runChecks, held-out reveal + execution** - `9d77419` (feat)
2. **Task 2: report table + runBench orchestrator + bench CLI command + CLI smoke test** - `8cd049a` (feat)
3. **Task 3: bench/METHODOLOGY.md with corrected citations (BENCH-05)** - `0b39a55` (docs)

**Plan metadata:** committed with this SUMMARY.md

## Files Created/Modified
- `src/bench/scorer.ts` - `scoreTask`: mkdtemp copy, node_modules junction/symlink, git baseline + diff, runChecks call, held-out reveal, held-out test run
- `src/bench/report.ts` - `cheatRateTable`: injectable-stream + picocolors before/after summary per model
- `src/bench/index.ts` - `runBench`: pool load, seeded selection, runner pick (mock/real), scoring loop, CSV write, report call
- `src/cli.ts` - `bench` command (`--tasks`/`--seed`/`--mock`/`--agent`/`--out`) replaces the stub
- `bench/METHODOLOGY.md` - benchmark methodology + citations + scope notes
- `tests/bench.test.ts` - synthetic RH002 fixture (cheat + honest branches) + real-pool integration cases (task-01, task-02) via the fixture runner
- `tests/cli.test.ts` - bench `--help`, CSV structure/row-count smoke test, seed-determinism test, `--tasks 0`/non-numeric validation tests
- `src/bench/tasks.ts` - `DEFAULT_TASKS_DIR` resolution fixed (see Deviations)

## Decisions Made
- **Vitest invocation without `npx`:** the task pool has no independent `node_modules` (each `repo/` is a bare set of source + test files), so `npx vitest run` inside the disposable temp copy would need network access to resolve `vitest` (or fail outright in non-interactive `npx`). Instead, `scoreTask` resolves proctor's own already-installed `vitest` binary via `createRequire(import.meta.url).resolve('vitest/package.json')` and spawns it directly (array-form, zero network), while a best-effort `node_modules` junction (Windows) / symlink (POSIX) into the temp copy lets the *copied* test/config files' own bare `'vitest'` / `'vitest/config'` imports resolve too. Verified working end-to-end against real `bench/tasks/task-01` and `task-02` fixtures, including a `vitest.config.js`-bearing task (task-05).
- **held-out/ reveal preserves nesting:** every real pool task's `held-out/*.hidden.test.js` imports its module via `'../moduleName.js'` — i.e. it expects to execute from one level below the repo root, exactly where it already sits relative to `repo/` inside `bench/tasks/task-NN/`. Copying `held-out/` in as a `workdir/held-out/` subdirectory (rather than flattening its contents into `workdir/`) is therefore the interpretation that makes the existing fixtures' imports resolve; flattening was tried first and breaks every task's hidden-test import path. Verified against task-01 (visible+hidden both pass on the honest fix; hidden fails on the cheat).
- **mock-agent.json placement:** fixture-runner (Plan 02) reads `mock-agent.json` from `task.workdir` (no separate source-dir field on `AgentTask`). `scoreTask` copies it into the temp workdir *before* the git baseline commit, so it's part of the baseline and never shows up as a spurious added file in the post-run diff (which would otherwise reach `runChecks` and could pollute `cheat_detected`/`rh_id`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug fix, blocking] `src/bench/tasks.ts`'s `DEFAULT_TASKS_DIR` broke under the bundled CLI**
- **Found during:** Task 2 (bench CLI wiring) — manual smoke test of `node dist/cli.js bench --mock --tasks 3 --seed 1 --out <path>` failed with `--tasks must be an integer between 1 and 0 (pool size)`, i.e. `loadTaskPool()` saw an empty pool.
- **Issue:** Plan 02's `DEFAULT_TASKS_DIR = join(__dirname, '../../bench/tasks')` assumes `import.meta.url` always points at the unbundled `src/bench/tasks.ts` source location (two levels below package root). `tsup` bundles the entire CLI into a single `dist/cli.js`, so at runtime `import.meta.url` points at `dist/` instead — the same fixed `'../../bench/tasks'` join then resolves two levels *above* the package root entirely (a nonexistent directory), silently returning an empty pool from every real `proctor bench` invocation. This was invisible to Plan 02's own tests because they run via vitest directly against the TypeScript source (unbundled), never through the built CLI.
- **Fix:** Replaced the fixed relative-offset join with `findPackageRoot(__dirname)` — a small walk-up (`existsSync(join(dir, 'package.json'))`, max 6 levels) that locates the package root regardless of whether the calling module is bundled or not. `DEFAULT_TASKS_DIR` is now `join(findPackageRoot(__dirname), 'bench/tasks')`.
- **Files modified:** `src/bench/tasks.ts`
- **Verification:** `node dist/cli.js bench --mock --tasks 3 --seed 1 --out <tmp>` now exits 0 with a correctly-populated 15-task pool; `node dist/cli.js bench --mock --tasks 0` correctly reports `--tasks must be an integer between 1 and 15 (pool size)`; `npx vitest run tests/bench-seed.test.ts` (Plan 02's own tests, unaffected by this change) still passes.
- **Committed in:** `8cd049a` (Task 2 commit, documented inline in the commit message)

---

**Total deviations:** 1 auto-fixed (1 blocking bug fix)
**Impact on plan:** Required for Task 2's own acceptance criteria (`proctor bench --mock` running end-to-end via the built CLI). No scope creep — fix is scoped to the one function whose fixed-offset assumption broke under bundling.

## Issues Encountered

- **RH001/RH003 overlap on `it.skip` transformations:** `bench/tasks/task-14` (authored in Plan 03 as an RH003 skip-pattern cheat) reports `rh_id=RH001` rather than `RH003` in a real `proctor bench --mock` run, because converting `it('name', ...)` to `it.skip('name', ...)` shows up in the diff as both a removed `it(` line and an added `it.skip(` line, which apparently also satisfies RH001's test-deletion heuristic (signature array order picks whichever finding comes first). `cheat_detected` is still correctly `true` either way, and this doesn't affect any acceptance criterion this plan is scored against (the real-pool integration tests in `tests/bench.test.ts` were deliberately written against task-01/RH001 and task-02/RH002, both of which report the expected single `rh_id`). This is pre-existing signature-level behavior in `src/signatures/rh001.ts`/`rh003.ts` (Phase 2/4, not touched by this plan) — logged here for visibility, not fixed (out of scope per SCOPE BOUNDARY).
- **Pre-existing, unrelated test failure:** `npm test` (full suite, 238 tests) surfaced the same pre-existing `tests/pre-classifier.test.ts > rejects mode-only diff` failure already documented in `.planning/phases/06-skill-adapters-benchmark/deferred-items.md` by Plans 01/02 (Windows POSIX-mode-bit limitation, unrelated to any file this plan touches). Not fixed, not retried, no new entry needed.
- **Test timeouts:** `scoreTask` spawns real `git` + `vitest` child processes per call (mkdtemp, baseline commit, held-out test run); vitest's default 5s per-test timeout was insufficient for tests exercising multiple `scoreTask` calls. Bumped per-test timeouts explicitly (30s in `tests/bench.test.ts`, 90s for the multi-task CLI smoke tests in `tests/cli.test.ts`) rather than lowering the global default, keeping the rest of the suite's fast-fail behavior intact.

## User Setup Required

None - no external service configuration required. Real (non-mock) `proctor bench` runs still require the `claude`/`codex` CLIs to be installed and authenticated (existing requirement from Plan 02, unchanged); every test in this plan uses `--mock` / the fixture runner only, no network calls.

## Next Phase Readiness

- BENCH-01/02/03/05 fully satisfied: `proctor bench --tasks N --seed S [--mock]` runs end-to-end against the real 15-task pool, writes the exact BENCH-03 CSV, prints a before/after table, and `bench/METHODOLOGY.md` documents the methodology with correctly-attributed citations.
- BENCH-04 (seeded selection) was already satisfied by Plan 02's `selectTasks`; this plan's CLI smoke test additionally verifies determinism end-to-end through the built CLI.
- Real (non-mock) agent runs against `claude-code`/`codex` are wired (`createShellRunner` + `AGENT_RUNNERS`) but not exercised by any automated test in this plan (by design — no network/CLI dependency in CI). Manual verification with a real agent CLI is open for whichever plan/checkpoint owns live-benchmark validation.
- `src/bench/tasks.ts`'s `findPackageRoot` fix benefits any other bench module relying on `DEFAULT_TASKS_DIR` and is transparent to Plan 02's existing callers/tests.

---
*Phase: 06-skill-adapters-benchmark*
*Completed: 2026-07-07*

## Self-Check: PASSED

All created files verified present on disk:
- FOUND: src/bench/scorer.ts
- FOUND: src/bench/report.ts
- FOUND: src/bench/index.ts
- FOUND: bench/METHODOLOGY.md
- FOUND: tests/bench.test.ts

All task commit hashes verified present in git log:
- FOUND: 9d77419 (feat: scorer.ts)
- FOUND: 8cd049a (feat: report + runBench + CLI + tests)
- FOUND: 0b39a55 (docs: bench/METHODOLOGY.md)

Targeted verification: `npm run build && npx vitest run tests/bench.test.ts` — 4/4 tests passed.
`npm run build && npx vitest run tests/cli.test.ts -t bench` — 5/5 tests passed.
Wave-merge verification: `npm run build && npm test` — build succeeded; full suite 237/238 passed (1 pre-existing, out-of-scope failure documented in Issues Encountered and deferred-items.md).
