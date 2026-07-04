---
phase: 02-core-rules-cli
plan: "01"
subsystem: reporters
tags: [reporters, context, cli, pretty, json]
dependency_graph:
  requires: []
  provides: [pretty-reporter, json-reporter, context-severity-fields]
  affects: [cli, engine]
tech_stack:
  added: []
  patterns: [picocolors-NO_COLOR-auto, stream-injection-for-testing]
key_files:
  created:
    - tests/reporters/pretty.test.ts
    - tests/reporters/json.test.ts
  modified:
    - src/types.ts
    - src/context.ts
    - src/reporters/pretty.ts
    - src/reporters/json.ts
    - src/signatures/rh001.ts
decisions:
  - "Stream injection via PrettyOptions.stream for testability (mock stream captures chunks)"
  - "Summary always uses ALL findings even in ci mode — counts are from full set"
  - "picocolors handles NO_COLOR automatically — no manual env check"
metrics:
  duration: "~8 minutes"
  completed: "2026-07-03"
---

# Phase 02 Plan 01: Reporters + Context Extension Summary

Extended RepoContext with CLI-10 severity/ignorePatterns fields and implemented pretty and JSON reporters with full test coverage.

## What Was Built

**Task 1 — RepoContext extension (src/types.ts, src/context.ts)**
- Added `severity?: Record<string, Severity>` and `ignorePatterns?: string[]` to `RepoContext` interface
- `buildRepoContext` return now spreads `config.severity` and `config.ignorePatterns` directly (optional, no coalescing)
- Backward-compatible: existing callers unaffected

**Task 2 — Pretty reporter (src/reporters/pretty.ts)**
- Replaced stub with full implementation importing `picocolors`
- Exports `PrettyOptions { stream?, ci? }` and `prettyReport(findings, opts?)`
- Groups findings by file under bold file header
- Per-finding: `❌` (error) or `⚠️` (warn) badge, `file:line [ruleId] message`, dimmed remediation
- CI mode: hides warn-severity findings from output, summary always shown
- Summary counts from ALL findings (not just visible); colored red/yellow/green accordingly
- NO_COLOR handled by picocolors automatically

**Task 3 — JSON reporter (src/reporters/json.ts)**
- One-liner: `return JSON.stringify(findings, null, 2)`
- CLI responsible for stream routing

**Test results:**
- 9/9 pretty reporter tests pass
- 3/3 JSON reporter tests pass
- 7/7 context tests pass (no regressions)
- 52/52 total tests pass
- Build: clean
- Typecheck: clean

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing TS2322 in rh001.ts extractTestName**
- **Found during:** Task 1 — npm run typecheck
- **Issue:** `m[1]` typed as `string | undefined` but function return type was `string`; TypeScript strict mode rejects this
- **Fix:** Changed `m ? m[1] : 'unknown'` to `m?.[1] ?? 'unknown'` in `extractTestName`
- **Files modified:** src/signatures/rh001.ts
- **Scope:** Pre-existing bug, not caused by current task, but blocking the typecheck acceptance criterion

## Self-Check: PASSED

- [x] src/types.ts exists with severity and ignorePatterns fields
- [x] src/context.ts return includes severity and ignorePatterns
- [x] src/reporters/pretty.ts exports prettyReport and PrettyOptions
- [x] src/reporters/json.ts exports jsonReport
- [x] tests/reporters/pretty.test.ts exists (9 tests)
- [x] tests/reporters/json.test.ts exists (3 tests)
- [x] Commit 9714563 verified in git log
