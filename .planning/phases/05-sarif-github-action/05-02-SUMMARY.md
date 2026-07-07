---
phase: 05-sarif-github-action
plan: 02
subsystem: infra
tags: [github-actions, ci, sarif, code-scanning, composite-action]

# Dependency graph
requires:
  - phase: 05-sarif-github-action
    provides: "Plan 01's sarifReport(findings) formatter and proctor check --sarif CLI flag with flush-safe exit codes"
provides:
  - "action.yml: composite GitHub Action that builds proctor from source and runs check --staged --sarif, uploading results to Code Scanning"
  - ".github/workflows/proctor.yml: example workflow with D-09 triggers (pull_request + push to main) and D-11 least-privilege permissions"
  - "tests/action-yml.test.ts: content-assertion smoke test locking required structure of both CI files"
affects: [05-sarif-github-action plan 03 (live PR-annotation + check-failure UX verification)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite GitHub Action built from github.workspace directly (no nested checkout) for self-referential dogfooding CI"
    - "YAML CI files smoke-tested via plain readFileSync string assertions, no YAML-parser dependency"

key-files:
  created:
    - action.yml
    - .github/workflows/proctor.yml
    - tests/action-yml.test.ts
  modified: []

key-decisions:
  - "Composite action builds from ${{ github.workspace }} directly (D-10) — no .proctor-src nested checkout, since the consuming workflow already checks out proctor's own repo there"
  - "Upload-sarif step carries if: always() (D-08) so SARIF uploads even when the check step's nonzero exit (error-severity findings) would otherwise short-circuit"
  - "Example workflow declares explicit least-privilege permissions: security-events: write + contents: read (D-11), not relying on default token scope"
  - "Workflow triggers on pull_request (all branches) + push to main (D-09), never pull_request_target — smoke test asserts pull_request_target is absent from both files"

patterns-established:
  - "First .github/workflows/ and action.yml files in this repo — established composite-action + example-workflow pairing pattern for future CI additions"

requirements-completed: [OUT-02]

# Metrics
duration: 6min
completed: 2026-07-07
---

# Phase 5 Plan 2: Composite GitHub Action + Example Workflow Summary

**Composite `action.yml` builds proctor from source and runs `check --staged --sarif` with `if: always()` SARIF upload to Code Scanning, paired with an example workflow triggering on PR + push-to-main under least-privilege permissions.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-07T06:52:00Z
- **Completed:** 2026-07-07T06:57:37Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- `action.yml` composite action: setup-node@v6 → `npm ci && npm run build` → `node dist/cli.js check --staged --sarif > results.sarif` → `github/codeql-action/upload-sarif@v4` with `if: always()`
- `.github/workflows/proctor.yml` example workflow: `pull_request` + `push` to `main` triggers, explicit `security-events: write` + `contents: read` permissions, `actions/checkout@v7` then `uses: ./`
- `tests/action-yml.test.ts`: 16 content-assertion tests over both YAML files via plain string matching (no YAML-parser dependency added)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author composite action.yml (repo root)** - `f4cefeb` (feat)
2. **Task 2: Author example workflow + content smoke test** - `3978e4d` (feat)

## Files Created/Modified
- `action.yml` - Composite GitHub Action: setup-node, build from source, run `--sarif` check with stdout redirect, always-upload SARIF step
- `.github/workflows/proctor.yml` - Example workflow demonstrating the action with D-09 triggers and D-11 permissions
- `tests/action-yml.test.ts` - vitest smoke test asserting required content/structure of both CI files (composite marker, pinned action versions, shell:bash coverage, trigger/permission strings, absence of `pull_request_target`)

## Decisions Made
- Followed the plan's Task 1 verification script's required strings exactly (`using: composite`, `actions/setup-node@v6`, `npm ci && npm run build`, `check --staged --sarif`, `github/codeql-action/upload-sarif@v4`, `if: always()`) — all present, `node -e` verification script passed as written.
- Test file structure mirrors `tests/reporters/json.test.ts`'s plain `describe`/`it` + `expect` style per the plan's read_first pointer, adapted to `readFileSync` string assertions instead of importing a formatter function.
- No new dependency added for YAML parsing, per RESEARCH.md's "zero new deps this phase" constraint — confirmed no yaml package appears in `package.json` after this plan.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated verification commands (the `node -e` content check for `action.yml`, and `npx vitest run tests/action-yml.test.ts`) passed on first attempt with no code changes needed beyond what the plan specified.

## Issues Encountered
- Fresh worktree had no `dist/` output yet (this worktree branched before Plan 01's build artifacts were regenerated locally), so the full `npm test` suite initially failed nearly every `cli.test.ts` case with `MODULE_NOT_FOUND` for `dist/cli.js`. Ran `npm run build` (out of scope for this plan's own file list, but required to validate the "npm test full suite green" acceptance criterion) — after building, only the pre-existing unrelated `tests/pre-classifier.test.ts > rejects mode-only diff` failure remained (documented in Plan 01's SUMMARY.md as out-of-scope, untouched by either plan's files). This is a local build-artifact staleness issue, not a code defect, and required no commit.
- `tests/action-yml.test.ts` itself (16/16 tests) and `npx tsc --noEmit` are both clean.

## User Setup Required

None - no external service configuration required. Note for the user: once this branch merges, GitHub Actions will pick up `.github/workflows/proctor.yml` automatically on the next `pull_request` or `push` to `main` — no dashboard configuration needed beyond the repo already having Code Scanning available (standard for public repos / GitHub Advanced Security for private repos).

## Next Phase Readiness
- `action.yml` and `.github/workflows/proctor.yml` are ready for Plan 03's live verification (opening a real PR against a repo running this Action and confirming inline annotations + check-failure UX — the non-automatable half of OUT-02).
- The pre-existing `tests/pre-classifier.test.ts` failure (from Phase 1, unrelated to Phase 5) still needs separate triage before the full suite is green; it does not block Plan 03.

---
*Phase: 05-sarif-github-action*
*Completed: 2026-07-07*
