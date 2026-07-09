---
phase: 07-distribution
plan: 03
subsystem: infra
tags: [demo-gif, vhs, fallback-tooling]

requires: []
provides:
  - demo.gif at repo root (DIST-03) — real, honest tool output, not fabricated
  - demo/render_demo_gif.py — reproducible fallback renderer (Python + Pillow, no headless browser)
affects: [phase-07-distribution]

tech-stack:
  added: []
  patterns:
    - "Fallback rendering path when a tool's dependency (VHS's go-rod/headless-Chrome) is environment-broken: capture real CLI output via subprocess, rasterize directly with Pillow — no browser automation needed for simple terminal-style frames"

key-files:
  created: [demo/demo.tape, demo/render_demo_gif.py, demo.gif, tests/demo-gif.test.ts]
  modified: []

key-decisions:
  - "VHS is confirmed broken in this dev environment (not a quick-fix issue) — diagnosed methodically before switching approach: standalone headless Chrome works, standalone ttyd works, but VHS's go-rod orchestration of the two hangs indefinitely on even a trivial one-line tape, across multiple Chromium builds and timeout lengths up to 180s"
  - "Built a self-contained Python/Pillow fallback renderer (demo/render_demo_gif.py) rather than fabricating GIF content by hand — it runs the real proctor CLI against a real scratch repo built from the project's own RH001 fixture, captures real ANSI-colored output, and rasterizes it directly, so the GIF still shows genuine tool behavior"
  - "Kept demo/demo.tape as the canonical VHS source (unchanged in intent) — added a header note explaining the fallback and pointing back to `vhs demo/demo.tape` as canonical wherever VHS actually works (e.g. Linux CI, a different machine)"

patterns-established:
  - "When a chosen tool's dependency is confirmed broken (not just misconfigured) in the current environment, prefer a from-scratch approach that reuses the REAL underlying data/behavior over either blocking indefinitely or fabricating a plausible-looking substitute"

requirements-completed: [DIST-03]

duration: ~90min
completed: 2026-07-08
---

# Phase 7: Distribution — Plan 03 Summary (Demo GIF)

**VHS (the planned rendering tool) is genuinely broken in this Windows dev environment — confirmed via isolated diagnosis, not just a retry-away flake — so built a from-scratch Python/Pillow fallback renderer that captures and rasterizes the real proctor CLI's real output instead. demo.gif exists at repo root, both required scenes present, all content genuine (not fabricated).**

## Performance

- **Duration:** ~90 min total across the session (Task 1/2 by a worktree executor before hitting a session-limit interruption mid-diagnosis; Task 3's render diagnosis and fallback build done directly by the orchestrator after resuming)
- **Completed:** 2026-07-08

## Accomplishments

- Task 1 (VHS/ttyd/ffmpeg install) and Task 2 (demo/demo.tape + tests/demo-gif.test.ts authoring) completed successfully by the worktree executor exactly as planned.
- Task 3 (the actual render) hung. The executor correctly diagnosed the failure class (go-rod driving headless Chrome over a DevTools Protocol websocket) before hitting a session-limit interruption mid-fix-attempt.
- On resume, methodically isolated the root cause rather than guessing:
  - Killed two orphaned `ttyd.exe` processes from earlier hung attempts — no effect, still hung.
  - Tested a **minimal one-line tape** (`echo hello`) — still hung at 30s, 90s, and 180s timeouts. This ruled out tape complexity/content as the cause.
  - Manually launched headless Chrome directly and queried its DevTools endpoint via `curl` — worked instantly (both `127.0.0.1` and `localhost`).
  - Manually launched `ttyd` directly and queried it via `curl` — worked instantly, served the real terminal HTML page.
  - Tested with `--disable-gpu` — no change.
  - Tested pointing go-rod at a completely different Chromium build (Playwright's bundled Chromium via `ROD_BROWSER_BIN`) — still hung identically.
  - Checked for an HTTP proxy that might interfere with Go's networking — none configured.
  - **Conclusion:** the failure is specifically in how VHS's Go binary orchestrates Chrome+ttyd together on this machine — both components work perfectly in isolation. This is a genuine environment incompatibility, not a config issue fixable by retrying or tweaking flags exposed through VHS's `.tape` DSL.
- Checked for WSL as an alternative (would let VHS run in a Linux environment) — not installed; installing it would need a system reboot, judged too invasive for this task.
- Built `demo/render_demo_gif.py`: a self-contained fallback that (1) builds the same scratch repo the `.tape` file describes (using the project's real RH001 fixture), (2) runs the real `git diff --staged`, `proctor check --staged`, and `proctor stop-hook` commands and captures their real ANSI-colored output, (3) parses the ANSI codes and rasterizes each "frame" directly with Pillow using Cascadia Mono, and (4) assembles the frames into `demo.gif` with appropriate hold durations — no headless browser anywhere in this path.
- Fixed two real bugs found while building the script: (1) the ANSI regex didn't match bare `\x1b[m` reset codes (no digits), causing garbage `␛[m` fragments to appear in early renders; (2) an environment-variable bug (`env={"FORCE_COLOR": "1"}` instead of merging with `os.environ`) would have wiped `PATH` and broken `node`/`git` resolution — caught before it caused a confusing downstream failure.
- Substituted the `❌` emoji (no glyph in Cascadia Mono, rendered as a tofu box) with a plain `[X]` marker for the rendered demo only — the real CLI's actual output is untouched; this is purely a rendering-fidelity fix for a font gap.
- Verified `demo.gif` visually (extracted and inspected multiple frames as PNGs) before finalizing: both scenes render cleanly and legibly, with real project data (the actual RH001 finding, the actual exit codes).
- `demo/demo.tape` is unchanged in intent — still the canonical VHS source, still committed, with a header note added explaining the fallback and stating `vhs demo/demo.tape` remains canonical wherever VHS works.
- All 7 `tests/demo-gif.test.ts` assertions pass; full suite 255/255.

## Task Commits

Tasks 1-2 committed by the worktree executor (merged via `chore: merge executor worktree`); Task 3's actual deliverable (demo.gif + fallback script) committed directly by the orchestrator after the worktree executor's render attempt hung and could not complete within its session:

1. (worktree, merged) — Task 1: VHS/ttyd/ffmpeg installed via official channels (scoop)
2. (worktree, merged) — `feat(07-03): author demo/demo.tape (two scenes) + tests/demo-gif.test.ts`
3. (this commit) — feat(07-03): render demo.gif via Pillow fallback (VHS confirmed broken in this environment)

## Files Created/Modified
- `demo/demo.tape` — VHS source (from worktree), header note added explaining the fallback
- `demo/render_demo_gif.py` — new, self-contained fallback renderer (Python + Pillow)
- `demo.gif` — new, rendered artifact at repo root (110KB, 7 frames)
- `tests/demo-gif.test.ts` — from worktree, unchanged (asserts content patterns + file existence, agnostic to render method)

## Decisions Made
- Chose to build a genuine fallback renderer over (a) endlessly retrying VHS, (b) fabricating GIF content by hand, or (c) installing WSL to try VHS in Linux. The fallback keeps the GIF honest (real captured CLI output) while working around the specific broken dependency, and stays reproducible (a committed script, not a one-off manual artifact).
- Kept `vhs demo/demo.tape` documented as canonical for environments where it works — this Windows-specific failure shouldn't be assumed to affect Linux CI or other developers' machines.

## Deviations from Plan

### Auto-fixed / Root-caused Issues

**1. [DIST-03] VHS hangs indefinitely in this environment — not tape-specific, not a transient flake**
- **Found during:** Task 3's render attempt (both the original worktree executor's attempt and the orchestrator's resumed attempts)
- **Issue:** `vhs demo/demo.tape` (and even a minimal one-line tape) hangs past 180s. Isolated to VHS's go-rod orchestration of headless-Chrome + ttyd specifically — both components work correctly standalone.
- **Fix:** Built `demo/render_demo_gif.py`, a from-scratch fallback using the real CLI's real output, no headless browser.
- **Files modified/created:** `demo/render_demo_gif.py`, `demo.gif`, `demo/demo.tape` (header note only)
- **Verification:** `npx vitest run tests/demo-gif.test.ts` — 7/7 pass; visual inspection of extracted frames confirms both scenes render correctly with genuine data.

**2. [correctness, found while building the fallback] ANSI bare-reset regex gap**
- **Issue:** `\x1b\[(\d+)m` didn't match `\x1b[m` (no digits, meaning reset) — git emits this form, causing literal `␛[m` garbage to appear in rendered diff output.
- **Fix:** Changed regex to `\x1b\[(\d*)m` and treat an empty digit group as code 0.

**3. [correctness, found while building the fallback] Environment-variable wipe bug**
- **Issue:** `subprocess.run(..., env={"FORCE_COLOR": "1"})` replaces the entire environment rather than extending it, which would have wiped `PATH` and broken `node`/`git` resolution the moment this script was run outside the exact conditions of my first ad-hoc test.
- **Fix:** Changed to `env={**os.environ, "FORCE_COLOR": "1"}`.

---

**Total deviations:** 1 major (VHS environment incompatibility, required a full alternate-tooling build) + 2 minor bugs caught and fixed while building the fallback.
**Impact on plan:** DIST-03's actual requirement (a real demo.gif at repo root, showing both scenes, honest content) is fully met. The mechanism differs from the plan's assumption (VHS render) but the `.tape` source, its two-scene structure, and its role as canonical documentation are all preserved intact.

## Issues Encountered

- Two separate Claude Code session-limit interruptions during this plan's execution (once mid-diagnosis in the worktree executor, once implicitly bounding how much further VHS troubleshooting was reasonable before pivoting). Both were worked around by resuming cleanly from the last committed state rather than losing progress.

## User Setup Required

None for the delivered demo.gif. Optional, non-blocking: if VHS's Windows incompatibility is worth investigating further (e.g., for future demo updates), it would need deeper Go/go-rod-level debugging or a Linux environment (WSL, CI, or another machine) — not required for this phase to be complete.

## Next Phase Readiness

demo.gif is ready for Plan 05's human visual sign-off checkpoint. Both required scenes (test-deletion catch, Stop hook block) are present and legible, built from genuine tool output.

---
*Phase: 07-distribution*
*Completed: 2026-07-08*
