---
phase: 02-core-rules-cli
plan: "03"
subsystem: signatures
tags: [rh003, rh007, skip-patterns, config-exclusions, signatures]
dependency_graph:
  requires: [src/diff.ts, src/types.ts]
  provides: [src/signatures/rh003.ts, src/signatures/rh007.ts]
  affects: []
tech_stack:
  added: []
  patterns: [pure-function, add-only-scan, regex-detection, config-file-guard]
key_files:
  created:
    - src/signatures/rh003.ts
    - src/signatures/rh007.ts
    - tests/signatures/rh003.test.ts
    - tests/signatures/rh007.test.ts
  modified: []
decisions:
  - "rh003 scans ALL files (not just test files) to catch Python skip decorators in non-standard file names"
  - "rh007 uses configLabel helper to produce human-readable config tool names (jest config, vitest config, tsconfig) matching fixture expected output"
  - "rh007 is unconditional in Phase 2 — no cross-file correlation; deferred to Phase 4"
  - "merged isConfigExclusionPattern into matchExclusion to return matched key for remediation message"
metrics:
  duration: "3 minutes"
  completed: "2026-07-04T02:40:01Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
---

# Phase 02 Plan 03: RH003 + RH007 Signatures Summary

RH003 skip/disable pattern detection (add-only scan across all files) and RH007 config exclusion detection (unconditional, config files only), both pure functions verified against fixtures.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | rh003.ts — skip/disable pattern check | db87fcc | src/signatures/rh003.ts, tests/signatures/rh003.test.ts |
| 2 | rh007.ts — config exclusion check | db87fcc | src/signatures/rh007.ts, tests/signatures/rh007.test.ts |

## What Was Built

**rh003** detects test skip/disable patterns in add-only changes across all files:
- JS/TS: `.skip(`, `.only(`, `xit(`, `xdescribe(`
- Python: `@pytest.mark.skip`, `@unittest.skip`, `@unittest.skipUnless`, `@skip`, commented-out `def test_`
- Extracts test name from `.skip`/`.only` patterns for descriptive messages
- Fixture: detects `it.skip('adds two numbers', ...)` at line 5 in calculator.test.ts

**rh007** detects config exclusion patterns in test config files (add-only):
- Config files: jest/vitest configs, tsconfig, pytest.ini, setup.cfg, pyproject.toml, conftest.py
- Patterns: `testPathIgnorePatterns`, `testMatch`, `testRegex`, `"exclude":`, `norecursedirs`, `ignore=`, `testpaths=`, `collect_ignore`
- Extracts the excluded value from the first quoted string after the matched keyword
- Fixture: detects `testPathIgnorePatterns: ['calculator.test.ts']` at line 2 in jest.config.ts

## Verification

```
npx vitest run tests/signatures/rh003.test.ts tests/signatures/rh007.test.ts --reporter=verbose
# 9/9 tests pass

npm run typecheck
# 0 errors

npm run test
# 61/61 tests pass (0 regressions)
```

## Deviations from Plan

### Auto-fixed Issues

None.

### Design Adjustments

**1. Merged isConfigExclusionPattern into matchExclusion**
- The plan described a separate `isConfigExclusionPattern(content)` boolean helper, but since the message builder also needs the matched keyword and position, a single `matchExclusion(content)` returning `{ key, afterMatch } | null` was more efficient (one pass through patterns instead of two).
- No behavior change; just a structural simplification per ponytail.

**2. configLabel helper for fixture compliance**
- The plan said `path.basename(file)` for the message, but the fixture expected.json requires "jest config" not "jest.config.ts". Added `configLabel(filePath)` to produce the expected human-readable label.

## Known Stubs

None.

## Threat Flags

None. Both functions are pure with no network/I/O.

## Self-Check: PASSED

- src/signatures/rh003.ts: FOUND
- src/signatures/rh007.ts: FOUND
- tests/signatures/rh003.test.ts: FOUND
- tests/signatures/rh007.test.ts: FOUND
- Commit db87fcc: FOUND
