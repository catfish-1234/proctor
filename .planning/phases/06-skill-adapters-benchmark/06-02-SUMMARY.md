---
phase: 06-skill-adapters-benchmark
plan: 02
subsystem: testing
tags: [benchmark, agent-runner, child_process, seeded-prng, csv, mulberry32]

# Dependency graph
requires:
  - phase: 06-skill-adapters-benchmark
    provides: "src/skill/SKILL.md (Plan 01, parallel wave — shell-runner reads it at runtime via import.meta.url-resolved path, not needed at build/test time)"
provides:
  - "src/bench/types.ts: AgentTask (incl. proctorOn), AgentResult, AgentRunner, MockAgentFile contracts"
  - "src/bench/csv.ts: hand-rolled CSV writer (csvField/toCsvRow/CSV_HEADER)"
  - "src/bench/tasks.ts: selectTasks (seeded, OS-independent) + loadTaskPool (disk loader)"
  - "src/bench/runners/registry.ts: AGENT_RUNNERS (claude-code, codex, gemini-cli)"
  - "src/bench/runners/shell-runner.ts: real AgentRunner (array-form spawn+timeout+SIGKILL, SKILL.md injection)"
  - "src/bench/runners/fixture-runner.ts: mock AgentRunner (mock-agent.json replay, no network)"
affects: [06-03, 06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled mulberry32-style seeded PRNG for deterministic, OS-independent task selection"
    - "Async spawn+setTimeout+SIGKILL for long-running subprocess with timeout (first async spawn precedent in repo; existing spawnSync precedent was sync-only)"
    - "Pluggable AgentRunner interface: real (shell-out) + mock (fixture-replay) implementations behind one contract"

key-files:
  created:
    - src/bench/types.ts
    - src/bench/csv.ts
    - src/bench/tasks.ts
    - src/bench/runners/registry.ts
    - src/bench/runners/shell-runner.ts
    - src/bench/runners/fixture-runner.ts
    - tests/bench-csv.test.ts
    - tests/bench-seed.test.ts
    - tests/bench-runner.test.ts
  modified: []

key-decisions:
  - "fixture-runner reads mock-agent.json from task.workdir (not a separate task-dir field) — AgentTask's locked interface (taskId/prompt/workdir/proctorOn) has no field for a source task directory distinct from workdir, so the fixture convention is: mock-agent.json is co-located inside workdir for a fixture-replay run"
  - "shell-runner's SKILL.md-injection comment avoids the literal substring 'shell:true' (rephrased to 'no shell option') so it does not falsely trip the plan's own grep -n \"shell:\\s*true\" verification check"

requirements-completed: [BENCH-02, BENCH-03, BENCH-04]

duration: ~15min
completed: 2026-07-08
---

# Phase 6 Plan 02: Bench Harness Foundations Summary

**Pluggable AgentRunner (real shell-out + mock fixture-replay) with proctorOn skill injection, hand-rolled RFC4180-minimal CSV writer, and a mulberry32-seeded, OS-independent task selector**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T20:43:00-07:00 (approx.)
- **Completed:** 2026-07-08T03:49:33Z
- **Tasks:** 3
- **Files modified:** 9 (6 source + 3 test)

## Accomplishments
- `AgentTask`/`AgentResult`/`AgentRunner`/`MockAgentFile` contracts defined (Task 1) so Plan 04's scorer/CLI wiring can build against them without exploration
- Hand-rolled CSV writer emits byte-exact `task_id,model,proctor_on,cheat_detected,rh_id,honest_pass` columns with minimal RFC4180 escaping (BENCH-03)
- `selectTasks` is deterministic and OS-independent: sorts task dir names lexicographically before a seeded Fisher-Yates shuffle (mulberry32 PRNG), rejects names failing `/^task-\d+$/`, clamps `n` to pool size (BENCH-04)
- `loadTaskPool` resolves `bench/tasks/` relative to package root via `import.meta.url` and returns each task's sub-paths (`prompt.md`, `repo/`, `held-out/`, `held-out.json`, `mock-agent.json`) without reading file contents
- `AGENT_RUNNERS` registry with 3 HIGH-confidence scriptable agents (claude-code, codex available; gemini-cli marked unavailable — mock fallback)
- Real `shell-runner` uses array-form `spawn(command[0], command.slice(1), ...)` only, enforces a timeout that SIGKILLs the child, and prepends `src/skill/SKILL.md` content to the prompt when `task.proctorOn` is true (BENCH-02's real intervention, not model nondeterminism)
- Mock `fixture-runner` replays the `proctorOn`/`proctorOff` branch of a task's `mock-agent.json` strictly by `task.proctorOn`, writes the recorded files into the workdir, and returns a synthetic `AgentResult` with no network call

## Task Commits

Each task was committed atomically (Task 1 and Task 2 followed strict TDD RED→GREEN; Task 3 is `type="auto"` without the `tdd="true"` attribute):

1. **Task 1: Contracts + CSV writer** — RED `241f963` (test), GREEN `ef514d8` (feat)
2. **Task 2: Seeded task selector + disk loader** — RED `133a545` (test), GREEN `521cfab` (feat)
3. **Task 3: Runner registry + shell-runner + fixture-runner + test** — `28ca8f6` (feat, includes test)

**Plan metadata:** committed with this SUMMARY.md

## Files Created/Modified
- `src/bench/types.ts` - AgentTask (incl. proctorOn), AgentResult, AgentRunner, MockAgentFile interfaces
- `src/bench/csv.ts` - csvField, toCsvRow, CSV_HEADER (verbatim RESEARCH Code Examples)
- `src/bench/tasks.ts` - mulberry32 PRNG, selectTasks, loadTaskPool
- `src/bench/runners/registry.ts` - AGENT_RUNNERS (claude-code, codex, gemini-cli)
- `src/bench/runners/shell-runner.ts` - createShellRunner: array-form spawn+timeout+SIGKILL, SKILL.md injection
- `src/bench/runners/fixture-runner.ts` - createFixtureRunner: mock-agent.json branch replay
- `tests/bench-csv.test.ts` - CSV_HEADER + toCsvRow quoting behavior tests
- `tests/bench-seed.test.ts` - selectTasks determinism, sort-before-shuffle, seed-variance, clamp, name-allowlist tests
- `tests/bench-runner.test.ts` - fixture-runner proctorOn/proctorOff branch write + AgentResult tests

## Decisions Made
- **fixture-runner's mock-agent.json location:** the plan's Task 1 locked `AgentTask` to exactly `{ taskId, prompt, workdir, proctorOn }` with no separate "task source dir" field. Task 3's fixture-runner therefore reads `mock-agent.json` directly from `task.workdir` rather than from a `bench/tasks/task-NN/` path derived from `taskId` — this matches the test's own setup ("a synthetic task workdir + a temp mock-agent.json in a tmpDir") and keeps the fixture runner fully self-contained within the locked interface, with no Rule 4 architectural change needed.
- **Avoided a false-positive grep match:** the plan's acceptance criteria runs `grep -n "shell:\s*true" src/bench/runners/shell-runner.ts` expecting no output. An early draft's explanatory comment literally contained the substring "shell:true" (inside "never shell:true or string interpolation"), which would have matched the regex and failed verification even though no `shell: true` option is ever passed to `spawn`. Reworded the comment to "no shell option" to keep the file's prose accurate without tripping the check.

## Deviations from Plan

None — plan executed exactly as written. The two items above are implementation judgment calls within the locked interfaces/acceptance criteria, not scope changes.

## Issues Encountered

**Windows worktree isolation:** `.planning/` is gitignored (`.gitignore` contains `.planning/`) and this executor runs inside a git worktree, which does not receive gitignored files from the main checkout. The plan file (`06-02-PLAN.md`), `PROJECT.md`, `STATE.md`, `06-RESEARCH.md`, and `06-PATTERNS.md` had to be read directly from the main repo checkout path (`C:/Users/kavis/Proctor/.planning/...`) rather than the worktree path. This is an environment/tooling quirk, not a plan defect — documented here for visibility, no action needed since read-only access to the main checkout's `.planning/` worked fine.

**Pre-existing, out-of-scope test failure:** `npm test` (wave-merge verification) surfaced 1 failing test — `tests/pre-classifier.test.ts > rejects mode-only diff` — unrelated to any file this plan touched (confirmed via `git log` showing that test file was last modified in Phase 1, commit `00b351f`). Likely a Windows POSIX-file-mode limitation (CLAUDE.md already notes `chmod +x` doesn't work on Windows). Logged to `.planning/phases/06-skill-adapters-benchmark/deferred-items.md` per the SCOPE BOUNDARY rule; not fixed, not retried.

## User Setup Required

None - no external service configuration required. Note: the real `shell-runner` (Task 3) requires the `claude`/`codex`/`gemini` CLIs to be installed and authenticated on the machine running `proctor bench` for real (non-mock) runs — this is existing local tooling, not new setup introduced by this plan, and no automated test in this plan invokes a real agent CLI.

## Next Phase Readiness

`src/bench/types.ts`, `src/bench/csv.ts`, `src/bench/tasks.ts`, and `src/bench/runners/*` are all unit-tested and ready for Plan 04 (scorer + CLI `bench` command wiring) to import directly. `AGENT_RUNNERS` is deliberately kept to 3 entries with the shell-runner generic, so a 4th/5th agent is a one-line registry addition per RESEARCH's Open Question 3 resolution. No blockers for downstream plans in this phase.

---
*Phase: 06-skill-adapters-benchmark*
*Completed: 2026-07-08*
