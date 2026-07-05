---
phase: 03-claude-code-stop-hook
plan: "01"
subsystem: cli
tags: [stop-hook, claude-code, install, settings]
dependency_graph:
  requires: [02-05]
  provides: [stop-hook-subcommand, install-claude-hook-complete]
  affects: [src/cli.ts, tests/cli.test.ts]
tech_stack:
  added: [node:os (homedir)]
  patterns: [async-iterator-stdin, spawnSync-subprocess, json-smart-merge]
key_files:
  created: []
  modified:
    - src/cli.ts
    - tests/cli.test.ts
decisions:
  - "stop-hook spawns proctor check --staged --ci as subprocess (D-10); does not import runChecks"
  - "readStdin() uses isTTY guard + async iterator for cross-platform stdin (no /dev/stdin)"
  - "stop-hook maps any non-2 exit to 0 (fail-open); only exits 2 on error findings"
  - "stop_hook_active guard prevents infinite blocking loops"
  - "install-claude-hook idempotency checked via command.includes('proctor stop-hook')"
metrics:
  duration: "~20 minutes"
  completed: "2026-07-04"
  tasks_completed: 2
  files_modified: 2
---

# Phase 3 Plan 1: Claude Code Stop Hook + Installer Summary

**One-liner:** Stop hook reads Claude Code stdin JSON, spawns `proctor check --staged --ci` subprocess, exits 2 on error findings; installer smart-merges `.claude/settings.json` with idempotency.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement stop-hook + complete install-claude-hook | 414444c | src/cli.ts |
| 2 | Smoke tests for stop-hook and install-claude-hook | 0c35f8a | tests/cli.test.ts |

## What Was Built

### stop-hook subcommand (src/cli.ts)

Added `readStdin()` module-level helper using async iterator with `isTTY` guard for cross-platform stdin reading (D-04, avoids `/dev/stdin` Windows pitfall).

Stop hook flow:
1. Reads stdin JSON — extracts `cwd` field (falls back to `process.cwd()` on invalid/empty JSON)
2. Checks `stop_hook_active === true` — exits 0 immediately to break infinite blocking loops
3. Spawns `proctor check --staged --ci` via `spawnSync(process.execPath, [process.argv[1], ...])` — subprocess approach per D-10
4. On spawn error (`result.error`): exits 0 (fail-open per D-05)
5. Writes subprocess stdout+stderr to `process.stderr` (feeds findings back to Claude Code)
6. Exits: `code === 2 ? 2 : 0` — maps exit 1 to 0, only propagates 2 (per D-06)

### install-claude-hook subcommand (src/cli.ts)

Replaced the `console.error('not implemented yet')` stub with full implementation:
- Resolves target path: `process.cwd()/.claude/settings.json` or `homedir()/.claude/settings.json` (`--global`)
- Reads existing file (ENOENT or invalid JSON → empty object start)
- Idempotency: searches `hooks.Stop[].hooks[].command` for `'proctor stop-hook'` — prints "Already installed" and exits 0 if found
- Merge: pushes `{ hooks: [{ type: 'command', command: 'npx proctor stop-hook' }] }` to `hooks.Stop[]`
- Writes JSON back with `JSON.stringify(settings, null, 2)`

### Smoke tests (tests/cli.test.ts)

Added `mkdirSync` and `homedir` to existing imports. Added 8 new tests inside existing `describe('CLI smoke tests')` block:

**stop-hook (4 tests):**
- Clean git dir with no staged changes → exits 0
- Invalid JSON stdin → fallback to `process.cwd()` → exits 0
- `stop_hook_active: true` in stdin → exits 0 (loop guard)
- Staged `it.skip(...)` violation → exits 2 (end-to-end)

**install-claude-hook (4 tests):**
- Creates `.claude/settings.json` with correct `type` and `command` fields
- Idempotent: second run prints "Already installed", Stop array has length 1
- Preserves pre-existing `permissions` and `hooks.PreToolUse` fields
- `--global` flag: stdout contains `.claude` and `settings.json` (homedir path check)

## Verification Results

- `npm run build` — exits 0, no TypeScript errors
- `node dist/cli.js stop-hook --help` — exits 0
- `node dist/cli.js install-claude-hook --help` — shows `--global` option
- `echo '{"cwd":"..."}' | node dist/cli.js stop-hook` — exits 0 in clean repo
- `install-claude-hook` in temp dir → correct JSON written, second run prints "Already installed"
- Full test suite: 81 tests pass across 13 test files, 0 failures

## Deviations from Plan

None — plan executed exactly as written. All decisions (D-01 through D-10) were honored.

## Threat Mitigations Applied

- **T-03-01:** `cwd` from stdin passed directly to spawnSync `cwd` option — never shell-interpolated; JSON.parse in try/catch; invalid JSON falls back to `process.cwd()`
- **T-03-03:** `process.stdin.isTTY` guard prevents stdin hang on manual invocation
- **T-03-04:** ENOENT/corrupt JSON catch leaves `settings = {}` — subsequent merge preserves proctor entry

## Self-Check: PASSED

- [x] src/cli.ts exists and contains stop-hook (verified: node dist/cli.js stop-hook --help exits 0)
- [x] tests/cli.test.ts exists with 8 new tests (81 total pass, 0 failures)
- [x] commit 414444c exists (feat(03-01): stop-hook subcommand + complete install-claude-hook)
- [x] commit 0c35f8a exists (feat(03-01): smoke tests for stop-hook and install-claude-hook)
