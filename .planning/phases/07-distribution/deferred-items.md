# Deferred Items — Phase 7 Distribution

## From Plan 07-01

### Pre-existing test failure: `tests/pre-classifier.test.ts > rejects mode-only diff`

- **Discovered during:** Full `npm test` run after completing all three 07-01 tasks.
- **Symptom:** `expect(reasons).toContain('mode-only')` fails — classifier returns
  `['rename-only']` instead. A stderr line also prints:
  `proctor: failed to parse proctor.config.json: SyntaxError: Expected property
  name or '}' in JSON at position 2 (line 1 column 3)`.
- **Scope:** `tests/pre-classifier.test.ts` was created in Phase 1
  (commit `00b351f`, "feat(01-03): add vitest tests for diff parser and
  pre-classifier") and is unrelated to 07-01's `files_modified`
  (`package.json`, `tests/dist-package-json.test.ts`, `scripts/verify-pack.sh`).
- **Action taken:** Not fixed — out of scope per the executor's scope-boundary
  rule (only auto-fix issues directly caused by the current task's changes).
  Confirmed the new/modified tests for this plan (`dist-package-json.test.ts`,
  `sarif.test.ts`, `cli.test.ts` — 37/37) all pass; this is the only failure in
  the full 248-test suite (247 passed / 1 failed).
- **Recommendation:** Investigate in a future plan/task — likely a stale
  `mode-only` vs `rename-only` reason label, or an ambient
  `proctor.config.json` on the test machine that the CLI subprocess is trying
  (and failing) to parse.
