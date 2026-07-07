---
phase: 05-sarif-github-action
plan: 01
subsystem: api
tags: [sarif, cli, reporters, code-scanning, sha256]

# Dependency graph
requires:
  - phase: 02-core-rules-cli
    provides: Finding type, jsonReport pure-formatter pattern, CLI check command with exit-code semantics
  - phase: 04-ast-layer-subtle-rules
    provides: all 8 RH-ID signatures registered in src/signatures/index.ts
provides:
  - "src/rules.ts: centralized RULE_METADATA registry (RuleMeta per RH-ID)"
  - "src/reporters/sarif.ts: pure sarifReport(findings) => SARIF 2.1.0 JSON string formatter"
  - "proctor check --sarif: flush-safe stdout SARIF output with severity-correct exit codes"
affects: [05-sarif-github-action plan 02 (GitHub Action consumes this CLI's stdout)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized static rule-metadata registry (src/rules.ts) as single source of truth for rule id/name/description/level/helpUri, consumed by sarif.ts"
    - "Flush-safe CLI exit: process.stdout.write(data, callback) + process.exitCode inside callback + return, instead of process.exit(), to avoid truncating output on non-TTY pipes"

key-files:
  created:
    - src/rules.ts
    - tests/reporters/sarif.test.ts
  modified:
    - src/reporters/sarif.ts
    - src/cli.ts
    - tests/cli.test.ts

key-decisions:
  - "Fingerprint hash input is ruleId:file:line only (no message text) per D-06 — keeps GitHub Code Scanning dedup stable across message/remediation wording tweaks"
  - "--sarif branch uses process.exitCode + return, never process.exit(), per D-13 — prevents truncated SARIF output on non-TTY pipes that would fail upload-sarif schema validation"
  - "runs[0].tool.driver.rules[] is built from the full static RULE_METADATA registry (all 8 RH-IDs), not just ruleIds present in findings, per D-01"

patterns-established:
  - "Reporters that return strings (json, sarif) are pure Finding[] => string; only pretty.ts writes to a stream directly"
  - "Rule-level static metadata (id/name/description/severity/helpUri) lives in src/rules.ts, separate from per-finding dynamic message/remediation strings in src/signatures/*.ts"

requirements-completed: [CLI-05, OUT-01]

# Metrics
duration: 25min
completed: 2026-07-07
---

# Phase 5 Plan 1: SARIF Formatter + CLI Wiring Summary

**`proctor check --sarif` now emits schema-valid SARIF 2.1.0 JSON to stdout with a full 8-rule registry and stable sha256 fingerprints, replacing the Phase 2/4 stub.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-07T06:26:00Z
- **Completed:** 2026-07-07T06:50:28Z
- **Tasks:** 3 (Task 2 is TDD: RED + GREEN commits)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Centralized `RULE_METADATA` registry (`src/rules.ts`) with full per-rule metadata (name, shortDescription, fullDescription, defaultLevel, helpUri) for all 8 RH-IDs
- Pure `sarifReport(findings)` formatter (`src/reporters/sarif.ts`) producing SARIF 2.1.0 JSON: full rule registry, combined message+remediation text, and sha256 `ruleId:file:line` fingerprints
- `proctor check --sarif` CLI branch rewritten to run after `runChecks` computes findings, using a flush-safe `process.stdout.write` callback + `process.exitCode` (never `process.exit()`) so SARIF output can't be truncated on non-TTY pipes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create centralized rule-metadata registry (src/rules.ts)** - `c24d8f2` (feat)
2. **Task 2: Implement SARIF formatter + unit tests** - `9349a73` (test, RED) then `ecbf235` (feat, GREEN)
3. **Task 3: Wire flush-safe --sarif branch in CLI + smoke test** - `3f943de` (feat)

_TDD task (Task 2) has two commits: failing test first (RED), then implementation (GREEN). No refactor commit was needed — the implementation was clean on first pass._

## Files Created/Modified
- `src/rules.ts` - `RuleMeta` interface + `RULE_METADATA` registry, 8 entries RH001-RH008, defaultLevel error/warning per signature severity
- `src/reporters/sarif.ts` - `sarifReport(findings): string` pure formatter; `levelFor`/`fingerprint` private helpers
- `tests/reporters/sarif.test.ts` - empty/shape/fingerprint/stability/level-mapping unit tests (5 tests)
- `src/cli.ts` - `--sarif` branch moved after `runChecks`, flush-safe exit via `process.exitCode` + `return`; old stub removed
- `tests/cli.test.ts` - new `describe('check --sarif flag')` smoke test; extended `--help` assertion to include `--sarif`

## Decisions Made
- Fingerprint hash input excludes message/remediation text (D-06) to keep dedup stable across wording-only edits — verified explicitly by the "stability" unit test.
- `runs[0].tool.driver.rules[]` always contains all 8 static rules regardless of which ruleIds appear in `findings`, per D-01 (full metadata) — simpler and matches GitHub Code Scanning's expectation that the rule catalog is stable per run, not filtered per-invocation.
- No `try/catch` inside `sarifReport` — matches `json.ts`'s pure-formatter convention; malformed-input handling stays the CLI's concern.

## Deviations from Plan

None - plan executed exactly as written. The plan's Task 1 verification script assumed `dist/rules.js` would exist after `npm run build`, but tsup only emits bundled output for its configured entries (`src/cli.ts`, `src/ai/judge.ts`) and their imports — at the point Task 1 was verified, nothing yet imported `rules.ts`. This was not a plan defect requiring a fix: I verified Task 1's acceptance criteria (8 keys in RH001..RH008 order, all fields present, RH006/RH008 warning, RH001 error, helpUri pattern) via a direct `node -e "import('./src/rules.ts')..."` check (Node 24 supports native TS type-stripping) instead of the dist path, and confirmed `npx tsc --noEmit` compiled cleanly. Once Task 2's `sarif.ts` imports `RULE_METADATA`, the module became part of the `dist/cli.js` bundle as intended, and the plan's literal dist-based verification command (`node -e "import('./dist/rules.js')..."`) would fail because tsup bundles all imports into the single `dist/cli.js` output file — it does not preserve `dist/rules.js` as a separate module path. This is a verification-command artifact of tsup's single-file bundling, not a functional gap; `RULE_METADATA` is correctly reachable through `dist/cli.js`'s `--sarif` code path, confirmed end-to-end by the Task 3 CLI smoke test.

## Issues Encountered
- `npm test` (full suite) has one pre-existing failure unrelated to this plan: `tests/pre-classifier.test.ts > rejects mode-only diff` fails with `expected [ 'rename-only' ] to include 'mode-only'`. This file was last modified in commit `00b351f` (Phase 1) and is untouched by this plan's Task 1-3 changes (`src/rules.ts`, `src/reporters/sarif.ts`, `src/cli.ts`, `tests/reporters/sarif.test.ts`, `tests/cli.test.ts`). Out of scope per the executor's scope-boundary rule — not fixed, logged here for visibility. All SARIF-specific tests (`tests/reporters/sarif.test.ts`, `tests/cli.test.ts -t "sarif"`) pass; `npm run build` and `npx tsc --noEmit` are both clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `sarifReport` and `RULE_METADATA` are stable, importable modules ready for Plan 02 (GitHub Action) to consume via `node dist/cli.js check --staged --sarif > results.sarif`.
- The pre-existing `pre-classifier.test.ts` failure should be triaged separately before Phase 5 is considered fully green; it does not block Plan 02 since it's unrelated to SARIF/CLI output.

---
*Phase: 05-sarif-github-action*
*Completed: 2026-07-07*
