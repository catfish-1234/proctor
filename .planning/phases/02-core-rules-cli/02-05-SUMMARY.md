---
phase: 02-core-rules-cli
plan: "05"
subsystem: cli
tags: [cli, integration, install-hook, check-action]
dependency_graph:
  requires: [02-04]
  provides: [working-cli, install-hook]
  affects: [src/cli.ts, tests/cli.test.ts]
tech_stack:
  added: []
  patterns: [commander-action, child-process-smoke-tests]
key_files:
  created: [tests/cli.test.ts]
  modified: [src/cli.ts]
decisions:
  - sarif and ai flags accepted silently in Phase 2 (no-op)
  - husky detection via devDependencies key presence in package.json
  - chmodSync for .git/hooks (never git-tracked), git add --chmod=+x for .husky (git-tracked)
metrics:
  duration: "~10 minutes"
  completed: "2026-07-04"
  tasks_completed: 2
  files_changed: 2
---

# Phase 2 Plan 05: CLI Wiring Summary

**One-liner:** Full check pipeline wired into CLI with husky-aware install-hook and 5 child-process smoke tests; `proctor check --staged` works end-to-end.

## What Was Built

- **`src/cli.ts` check action** — routes `runGitDiff -> classifyDiff -> buildRepoContext -> runChecks -> prettyReport/jsonReport`; exits 0/1/2 per finding severity; `--json` sends JSON to stdout and pretty to stderr simultaneously; `--sarif`/`--ai` accepted silently (Phase 4/5 work)
- **`src/cli.ts` install-hook action** — detects husky via `devDependencies`; writes hook to `.husky/pre-commit` (with `git add --chmod=+x`) or `.git/hooks/pre-commit` (with `chmodSync`); Windows-safe
- **`tests/cli.test.ts`** — 5 smoke tests via `spawnSync` on built `dist/cli.js`; covers help, non-git-dir exit 2, standard hook install, husky hook install, and `--version`

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

73 tests pass (68 pre-existing + 5 new CLI smoke tests), typecheck clean.

## Self-Check

- `src/cli.ts` — modified, contains runGitDiff wiring
- `tests/cli.test.ts` — created at correct path
- Commit `665ed8f` exists: `feat(02-05): CLI wiring — check pipeline + install-hook action + smoke tests`

## Self-Check: PASSED
