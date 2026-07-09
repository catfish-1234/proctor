---
phase: 07-distribution
plan: 01
subsystem: infra
tags: [npm, package.json, publishing, verify-pack, tdd]

# Dependency graph
requires:
  - phase: 05-sarif-github-action
    provides: catfish-1234 GitHub org correction (STATE.md line 75) reused for the repository field
  - phase: 06-skill-adapters-benchmark
    provides: stable CLI surface (7 subcommands) that verify-pack.sh exercises via a packed tarball
provides:
  - "package.json at version 1.0.0 with a well-formed repository field (github.com/catfish-1234/proctor)"
  - "npm run verify:pack — a repeatable, scripted fresh-machine <60s timing check for the packed tarball"
  - "tests/dist-package-json.test.ts — regression guard on version/bin/files/engines/repository/verify:pack fields"
affects: [07-04-publish, 07-05-readme-and-demo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-assertion smoke test for package.json via JSON.parse (not raw string matching), following tests/action-yml.test.ts's flat describe/it shape"
    - "Fresh-machine verification via npm pack + mktemp-dir install, run entirely outside the repo tree (no Docker)"

key-files:
  created:
    - tests/dist-package-json.test.ts
    - scripts/verify-pack.sh
  modified:
    - package.json

key-decisions:
  - "verify:pack extracted to scripts/verify-pack.sh (not inlined in package.json) for readability and bash -n testability"
  - "verify-pack.sh times 'proctor check' without requiring exit 0 — the mktemp install dir is not a git repo, so a nonzero exit is expected; only the elapsed time is asserted against the 60s budget"
  - "sarif.test.ts and cli.test.ts confirmed to assert SARIF schema version (2.1.0) and --version exit code only, not a literal pkg.version string — no changes needed to either"

patterns-established:
  - "verify-pack.sh: mktemp -d install pattern for future fresh-machine checks (repo tree isolation, trap-based cleanup)"

requirements-completed: [DIST-01]

# Metrics
duration: 12min
completed: 2026-07-08
---

# Phase 7 Plan 01: package.json Publish Prep Summary

**package.json bumped to 1.0.0 with a catfish-1234 repository field and a scripted, verified-passing `npm run verify:pack` fresh-machine timing check (<60s).**

## Performance

- **Duration:** 12 min (18:16:39 - 18:24:38 PDT commit span)
- **Started:** 2026-07-09T01:16:00Z
- **Completed:** 2026-07-09T01:24:38Z
- **Tasks:** 3/3 completed
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments
- `package.json` is publishable at version 1.0.0 with a correct `repository` field pointing at `github.com/catfish-1234/proctor` (not the wrong `kavishdua` org)
- `npm run verify:pack` exists, wraps a real `npm pack` + isolated-tempdir install + timed `proctor check` invocation, and was run end-to-end during execution: **PASS in 1s** (60s budget)
- `tests/dist-package-json.test.ts` (7 assertions) is fully green and guards against regressions on version, bin, files, engines, repository, and the verify:pack script entry — including a negative regression guard on the `kavishdua/proctor` org bug

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Wave 0 — write the publishable-metadata smoke test (RED first)** - `ba9ddc8` (test)
2. **Task 2: Bump version to 1.0.0, add repository field, register verify:pack script** - `04f958c` (feat)
3. **Task 3: Create scripts/verify-pack.sh (fresh-machine <60s timing check)** - `7c03e84` (feat)

_TDD gate compliance: RED commit (`ba9ddc8`, 4 failing / 3 passing) confirmed before GREEN commit (`04f958c`)._

## Files Created/Modified
- `package.json` - version 0.1.0 → 1.0.0; added `repository` object (catfish-1234/proctor); added `scripts["verify:pack"]`
- `tests/dist-package-json.test.ts` - content-assertion smoke test (7 `it()`s) for publishable package.json metadata, modeled on `tests/action-yml.test.ts`
- `scripts/verify-pack.sh` - builds, packs, installs the real tarball into an isolated `mktemp -d` dir (outside the repo tree), times `proctor check`, asserts <60s, cleans up on exit; no `npm publish`

## Decisions Made
- Extracted `verify:pack`'s bash sequence to `scripts/verify-pack.sh` rather than inlining in `package.json`, per 07-PATTERNS.md's "planner's call" — chose the file for `bash -n` testability and readability.
- `verify-pack.sh` does not require `proctor check` to exit 0 inside the isolated temp dir (which is intentionally not a git repo) — only the elapsed wall-clock time is gated against the 60s budget, consistent with the plan's framing ("time the actual CLI invocation... assert the real-time is under 60 seconds").
- Confirmed via `read_first` that `tests/reporters/sarif.test.ts` asserts the SARIF schema version (`'2.1.0'`, a spec constant) and `tests/cli.test.ts`'s `--version` test checks exit code only — neither needed a literal-version-string update.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built the project before running Task 2/3 verification**
- **Found during:** Task 2 verification (`npx vitest run tests/dist-package-json.test.ts tests/reporters/sarif.test.ts tests/cli.test.ts`)
- **Issue:** This worktree had no `dist/` directory (gitignored, never built in this fresh checkout), so all 25 `tests/cli.test.ts` tests failed with the CLI subprocess exiting 1 (module not found) rather than their expected codes — a blocking issue unrelated to the package.json edit itself.
- **Fix:** Ran `npm run build` (the plan's own scripts.build) before re-running the verification command.
- **Files modified:** none (build artifact only, gitignored `dist/`)
- **Verification:** Re-ran the same 3-file vitest command — 37/37 passed.
- **Committed in:** n/a (no source change; documented here for transparency)

---

**Total deviations:** 1 auto-fixed (1 blocking — Rule 3)
**Impact on plan:** No scope creep; a one-time environment-setup step needed because this is a freshly created git worktree with no prior build artifact.

## Issues Encountered
- Full `npm test` run (248 tests, run as an extra sanity check beyond the plan's own per-task verify commands) surfaced one pre-existing failure: `tests/pre-classifier.test.ts > rejects mode-only diff` (classifier returns `'rename-only'` instead of `'mode-only'`, plus a `proctor.config.json` parse-error stderr line). This file was created in Phase 1 (`00b351f`) and is entirely outside this plan's `files_modified` scope (`package.json`, `tests/dist-package-json.test.ts`, `scripts/verify-pack.sh`). Logged to `.planning/phases/07-distribution/deferred-items.md`, not fixed, per the scope-boundary rule. All of this plan's own tests (37: dist-package-json + sarif + cli) pass.

## User Setup Required

None - no external service configuration required. (The actual `npm publish` is explicitly deferred to a later plan per D-01/D-02 in 07-RESEARCH.md — this plan produces no external side effects.)

## Next Phase Readiness
- `package.json` is publish-ready at 1.0.0 with correct metadata; `npm run verify:pack` gives Plan 05 (the real `npm publish` plan) a pre-publish gate to run.
- One pre-existing, out-of-scope test failure remains open in `tests/pre-classifier.test.ts` (see deferred-items.md) — does not block this plan's DIST-01 scope but should be triaged before the milestone closes.

---
*Phase: 07-distribution*
*Completed: 2026-07-08*
