# demo/demo.tape — two-scene proctor demo
# Regenerate with: vhs demo/demo.tape   (run from repo root so `demo.gif` lands there)
#
# NOTE: on this project's Windows dev machine, VHS's go-rod dependency hung
# indefinitely (confirmed via isolated diagnosis — not tape-specific: even a
# one-line tape hung, with headless Chrome and ttyd each working fine
# standalone). The committed demo.gif was rendered via the fallback script
# demo/render_demo_gif.py instead, which reproduces these same two scenes by
# running the real proctor CLI and rasterizing its real output with Pillow —
# no headless browser involved. If `vhs demo/demo.tape` works in your
# environment, it remains the canonical way to regenerate demo.gif; this tape
# is still the source of truth for the two-scene structure either way.
Output demo.gif
Require git
Require node

Set Shell "bash"
Set FontSize 26
Set Width 1200
Set Height 700
Set Theme "Dracula"
Set TypingSpeed 40ms
Set Padding 20

# --- Off-camera setup: build a scratch repo with a staged test-deletion cheat ---
# Uses the repo's own RH001 fixture (calculator + before/after test file) so the
# scene is realistic without hand-typing multi-line source in the recording.
Hide
Type "REPO_ROOT=$(pwd)"
Enter
Type "rm -rf /tmp/proctor-demo && mkdir -p /tmp/proctor-demo && cd /tmp/proctor-demo"
Enter
Type "git init -q && git config user.email demo@proctor.dev && git config user.name proctor-demo"
Enter
Type "cp $REPO_ROOT/fixtures/RH004/before/calculator.ts . && cp $REPO_ROOT/fixtures/RH001/before/calculator.test.ts ."
Enter
Type "git add -A && git commit -q -m 'add calculator with tests'"
Enter
Type "cp $REPO_ROOT/fixtures/RH001/after/calculator.test.ts ."
Enter
Type "git add -A"
Enter
Type "alias proctor='node $REPO_ROOT/dist/cli.js'"
Enter
Type "clear"
Enter
Show

# --- Scene 1: CLI catches a staged test deletion ---
Type "git diff --staged"
Enter
Sleep 2s
Type "proctor check --staged"
Enter
Sleep 3s
# (finding + exit 2 visible on screen — RH001, red, remediation text)

Sleep 2s
Type "clear"
Enter

# --- Scene 2: Claude Code Stop hook blocks the turn (simulated, deterministic) ---
# Simulated rather than a live `claude -p` call, so it's reproducible, has no variable
# agent latency, and no risk of a real credential ever appearing on screen.
Hide
Type "node -e 'process.stdout.write(JSON.stringify({cwd:process.cwd()}))' > stop-hook-input.json"
Enter
Show
Type "# Claude Code session: agent attempts to delete a test to make it pass"
Enter
Sleep 1s
Type "cat stop-hook-input.json | proctor stop-hook; echo EXIT_CODE=$?"
Enter
Wait+Screen /EXIT_CODE=2/
Sleep 2s
