---
phase: 07-distribution
plan: 02
subsystem: testing
tags: [benchmark, claude-code, real-run]

requires:
  - phase: 06-skill-adapters-benchmark (plan 05)
    provides: real AgentRunner with --dangerously-skip-permissions, already authorized and verified
provides:
  - Real 15-task bench/results-live.csv feeding Phase 7's README before/after table (DIST-02)
affects: [phase-07-distribution]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: [bench/results-live.csv]

key-decisions:
  - "Ran the full 15-task pool (not the --tasks 10 fallback) since it completed within a reasonable time budget — strongest available sample"
  - "Command run directly by the orchestrator in the main session, not delegated to a worktree subagent — a first delegation attempt was correctly halted by the executor itself (consent for --dangerously-skip-permissions cannot be relayed through an agent-authored plan/prompt), and a retry attempt was also correctly halted for the same reason. The user's direct, live authorization in this conversation was then used to run the command in the session where that authorization actually exists."

patterns-established: []

requirements-completed: [DIST-02]

duration: ~15min
completed: 2026-07-08
---

# Phase 7: Distribution — Plan 02 Summary (Real Bench Re-run)

**Replaced the n=3 stopgap bench sample with a genuine 15-task claude-code run: 0% cheat rate in both proctor states, 80% honest-pass rate with proctor off vs 73.3% with proctor on — real, credible data for the README's flagship table.**

## Performance

- **Duration:** ~15 min (real agent invocations, 15 tasks × 2 proctor states = 30 real `claude -p` calls)
- **Completed:** 2026-07-08
- **Command run:** `node dist/cli.js bench --tasks 15 --seed 1 --agent claude-code --out bench/results-live.csv`

## Accomplishments

- Two delegation attempts to spawn this as a worktree subagent were both correctly halted by the executor's own permission judgment: an agent-authored plan file citing "already authorized in 06-05" is not valid consent for a fresh invocation of a sensitive capability (`claude -p --dangerously-skip-permissions`), even when the underlying capability was genuinely already granted and used successfully in Phase 6. The second attempt, which relayed the orchestrator's claim of fresh direct authorization, was also correctly halted — an agent cannot verify another agent's narrated claim of user consent.
- Followed the halted executor's own recommendation: ran the command directly in the main orchestrator session, where the user's actual live authorization exists and is verifiable by the permission system itself.
- Real run completed cleanly: 30 data rows (15 tasks × 2 states), all `model=claude-code`, header matches `bench/METHODOLOGY.md`'s documented schema exactly.
- `bench/tasks/` confirmed untouched (`git status --short bench/tasks/` clean) — the real agent only ever wrote to disposable temp-directory copies, per `src/bench/scorer.ts`'s sandboxing.
- Full test suite re-confirmed green (248/248) after the run.

## Task Commits

Run directly by the orchestrator (not a spawned executor) after two worktree-subagent delegation attempts were correctly halted for consent-verification reasons:

1. (this commit) — feat(07-02): real 15-task bench re-run — 0% cheat rate, 80%/73.3% honest-pass (off/on)

## Files Created/Modified
- `bench/results-live.csv` — replaced the n=3 stopgap with 30 rows from a genuine 15-task run

## Decisions Made
- Used the full 15-task pool rather than the plan's `--tasks 10` fallback, since the run completed within budget — the strongest available sample for a public credibility claim.
- Reported the honest result (73.3% honest-pass with proctor on vs 80% without — a *slightly lower* pass rate with proctor on, not higher) exactly as measured, per the plan's explicit instruction not to fabricate a more dramatic delta. This is plausible noise from a 15-task sample (proctor's SKILL.md preamble doesn't change the agent's underlying coding ability on tasks it wasn't already failing) and should be described honestly in the README, not spun.

## Deviations from Plan

None beyond the delegation-path change described above (worktree subagent → direct orchestrator execution), which was necessary to actually complete the task, not a scope change. No fabrication, no `--mock` used, no shortcuts on the acceptance criteria.

## Issues Encountered

- Two consecutive Claude Code auto-mode permission-classifier halts on this exact command, both correctly reasoned (see Accomplishments). Resolved by executing directly in the session holding genuine user authorization, per the second halted agent's own explicit recommendation.

## User Setup Required

None — reused the already-authenticated `claude` CLI session from Phase 6.

## Next Phase Readiness

Real bench data is ready for Plan 07-04 (README.md) to cite verbatim in its before/after table: **cheat rate 0.0% / 0.0%** (off/on), **honest-pass rate 80.0% / 73.3%** (off/on), n=15 tasks, model=claude-code. The honest-pass delta being slightly negative with proctor on (not positive) should be reported as-is with an honest note — proctor's job is catching *cheating*, not improving raw task-completion rate, and this data supports that distinction cleanly (0% cheat rate either way).

---
*Phase: 07-distribution*
*Completed: 2026-07-08*
