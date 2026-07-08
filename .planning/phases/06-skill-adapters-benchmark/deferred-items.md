# Deferred Items — Phase 06

## tests/pre-classifier.test.ts: "rejects mode-only diff" failing

- **Found during:** Plan 06-01, Task 3 full-suite verification (`npm test`)
- **File:** `tests/pre-classifier.test.ts` (line ~82), backed by `src/pre-classifier.ts`
- **Symptom:** `expect(reasons).toContain('mode-only')` fails — actual reasons are `['rename-only']`. A mode-only diff is apparently being classified as `rename-only` instead of `mode-only`.
- **Scope:** Out of scope for plan 06-01 (`files_modified` for this plan is limited to `src/skill/SKILL.md`, `src/adapters/registry.ts`, `src/adapters/drift-check.ts`, `src/cli.ts`, `package.json`, `tests/skill.test.ts`, `tests/drift-check.test.ts`, `tests/cli.test.ts`). Neither `src/pre-classifier.ts` nor `tests/pre-classifier.test.ts` were touched by this plan.
- **Action:** Not fixed here per deviation-rules scope boundary. Flag for a future phase/plan owning `src/pre-classifier.ts`.
