---
phase: 04-ast-layer-subtle-rules
plan: 01
subsystem: types-and-context
tags: [ast, types, context, phase4-foundation]
dependency_graph:
  requires: [03-01]
  provides: [RepoContext.commitMessage, RepoContext.ast, RepoContext.aiEnabled, RepoContext.judge, RepoContext.aiModel, RepoContext.snapshotGlobs, ProctorConfig.aiModel, ProctorConfig.snapshotGlobs, src/ai/judge.ts]
  affects: [src/types.ts, src/context.ts, src/ai/judge.ts, package.json]
tech_stack:
  added:
    - "@typescript-eslint/typescript-estree@^8.62.1 (devDep)"
    - "@anthropic-ai/sdk@^0.110.0 (dep)"
  patterns:
    - "type-only imports for forward-declared interfaces"
    - "spawnSync for git log -1 --format=%s with status guard"
    - "TDD RED/GREEN cycle for context extension"
key_files:
  created:
    - src/ai/judge.ts
  modified:
    - src/types.ts
    - src/context.ts
    - src/cli.ts
    - package.json
    - package-lock.json
    - tests/context.test.ts
decisions:
  - "@typescript-eslint/typescript-estree goes in devDependencies (bundled by tsup at build time)"
  - "@anthropic-ai/sdk goes in dependencies (runtime when --ai is passed)"
  - "src/ai/judge.ts created in this plan (not deferred) so types.ts import resolves at compile time"
  - "snapshotGlobs has no default in context.ts — rh006.ts owns DEFAULT_SNAPSHOT_GLOBS per plan spec"
metrics:
  duration: "~12 minutes"
  completed: "2026-07-06T04:04:25Z"
  tasks_completed: 2
  files_changed: 7
---

# Phase 4 Plan 1: Phase 4 Foundation — npm deps + types/context extension Summary

Install Phase 4 npm dependencies (`@typescript-eslint/typescript-estree`, `@anthropic-ai/sdk`), extend `RepoContext`/`ProctorConfig` interfaces with six new optional Phase 4 fields, create `src/ai/judge.ts` with the `AIJudge` interface and `createAnthropicJudge` factory, and extend `buildRepoContext()` to populate `commitMessage` via `git log -1 --format=%s`.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Install packages + extend src/types.ts | a8eb827 | Complete |
| 2 (RED) | Failing tests for Phase 4 context fields | 578ef29 | Complete |
| 2 (GREEN) | Implement commitMessage/snapshotGlobs/aiModel in context.ts | 5b5460c | Complete |

## What Was Built

**`src/types.ts` — Phase 4 interface extensions:**
- `RepoContext` now has: `commitMessage?`, `snapshotGlobs?`, `aiEnabled?`, `aiModel?`, `judge?: AIJudge`, `ast?: Map<string, TSESTree.Program>`
- `ProctorConfig` now has: `aiModel?`, `snapshotGlobs?`
- Uses `type-only` imports: `import type { TSESTree }` from typescript-estree, `import type { AIJudge }` from `./ai/judge.js`

**`src/ai/judge.ts` — AI judge module (new file):**
- `AIJudge` interface: `judge(ctx: JudgeContext): Promise<boolean>`
- `JudgeContext` type: `{ ruleId, diffExcerpt, explanation }`
- `createAnthropicJudge(apiKey, model)` factory using `@anthropic-ai/sdk`
- Security: API key passed as constructor arg, never logged; diff content in user message body only

**`src/context.ts` — buildRepoContext extended:**
- Imports `spawnSync` from `node:child_process`
- Runs `git log -1 --format=%s` with `status === 0` guard (empty repo exits 128 → `undefined`)
- Reads `snapshotGlobs` and `aiModel` from config (no defaults; rh006.ts owns them)
- Returns three new fields: `commitMessage`, `snapshotGlobs`, `aiModel`

**`tests/context.test.ts` — 5 new tests:**
- `commitMessage` is non-empty string in project root (has commits)
- `commitMessage` is `undefined` in fresh git repo with no commits
- `aiModel` read from `proctor.config.json`
- `snapshotGlobs` is `undefined` when no config
- `snapshotGlobs` read from `proctor.config.json`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TypeScript error in src/cli.ts**
- **Found during:** Task 1 (tsc --noEmit run)
- **Issue:** `process.argv[1]` typed as `string | undefined` in `@types/node 26.x`; passed directly to `spawnSync` which requires `string`
- **Fix:** `process.argv[1] ?? ''` null-coalescing guard
- **Files modified:** `src/cli.ts`
- **Commit:** a8eb827

**2. [Rule 2 - Missing Critical] Created src/ai/judge.ts in this plan (not Plan 04-02)**
- **Found during:** Task 1 (tsc --noEmit fails: "Cannot find module './ai/judge.js'")
- **Issue:** `types.ts` has `import type { AIJudge } from './ai/judge.js'` but the plan said this file would be created in Plan 04-02
- **Fix:** Created `src/ai/judge.ts` with the `AIJudge` interface and full `createAnthropicJudge` factory — TypeScript requires the module to exist even for type-only imports
- **Files modified:** `src/ai/judge.ts` (new)
- **Commit:** a8eb827

## Known Stubs

None — all implementations are complete for this plan's scope.

## Threat Flags

None — no new network endpoints or trust boundary crossings introduced in this plan.

## Out-of-Scope Pre-existing Failures (noted for deferred tracking)

Two pre-existing test failures exist in the repo but are unrelated to this plan:
1. `tests/cli.test.ts` — all 13 tests fail because `dist/cli.js` is not built in this worktree (gitignored)
2. `tests/pre-classifier.test.ts` — 1 test fails (`rejects mode-only diff`) — confirmed pre-existing before these changes

These are out of scope per deviation rules and should be addressed by a subsequent plan or build step.

## Self-Check

### Files Exist
- [x] `src/types.ts` — extended with Phase 4 fields
- [x] `src/context.ts` — extended with commitMessage/snapshotGlobs/aiModel
- [x] `src/ai/judge.ts` — created with AIJudge interface
- [x] `tests/context.test.ts` — extended with 5 new tests
- [x] `package.json` — @typescript-eslint/typescript-estree (devDep) + @anthropic-ai/sdk (dep)
- [x] `node_modules/@typescript-eslint/typescript-estree` — installed
- [x] `node_modules/@anthropic-ai/sdk` — installed

### Commits Exist
- [x] a8eb827 — feat(04-01): install Phase 4 deps and extend types.ts with AST/AI fields
- [x] 578ef29 — test(04-01): add failing context tests for Phase 4 fields (RED)
- [x] 5b5460c — feat(04-01): extend buildRepoContext with commitMessage, snapshotGlobs, aiModel (GREEN)

### Verification
- [x] `npx tsc --noEmit` exits 0
- [x] `npm test -- tests/context.test.ts` exits 0 (12/12 tests pass)
- [x] `src/types.ts` contains `ast?: Map<string, TSESTree.Program>` (not ParseResult)
- [x] `src/context.ts` contains `git log -1 --format=%s`

## Self-Check: PASSED
