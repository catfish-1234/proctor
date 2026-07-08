# Deferred Items — Phase 6

## Pre-existing failure: `tests/pre-classifier.test.ts` > "rejects mode-only diff"

- **Found during:** 06-02 wave-merge verification (`npm test`)
- **Status:** Pre-existing, out of scope for 06-02 — not caused by any file this plan touched
- **Evidence:** `git log --oneline -- tests/pre-classifier.test.ts` shows the file was last
  modified in `00b351f` (Phase 1, plan 03), long before Phase 6 work began.
- **Symptom:** `expected [ 'rename-only' ] to include 'mode-only'` — the pre-classifier
  is reporting a `git diff` as `rename-only` instead of `mode-only` on this dev machine.
- **Likely cause:** Windows filesystem does not support POSIX file-mode bits the way
  the test's `before`/`after` fixture pair expects (CLAUDE.md already notes: "`chmod +x`
  does not work on Windows — use `git add --chmod=+x`"). A mode-only change (100644 ->
  100755) may not materialize as a pure mode change under Windows git, causing the
  classifier to see it as a rename/content change instead.
- **Action taken:** None — left as-is per SCOPE BOUNDARY rule (only auto-fix issues
  directly caused by the current task's changes). Not fixed, not re-run repeatedly.
- **Recommendation:** Investigate on a Linux/macOS CI runner where POSIX mode bits are
  respected, or make the fixture Windows-safe (e.g. skip/mark platform-specific).
