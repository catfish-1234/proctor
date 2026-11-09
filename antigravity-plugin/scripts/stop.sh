#!/bin/sh
# Antigravity CLI Stop hook for proctor. Reads the Stop payload on stdin and prints a JSON object.
# Runs `proctor stop-hook --format antigravity`, which prints {"decision":"block",...} when the
# working tree games its tests and nothing otherwise. Fails open: if proctor cannot run, the turn
# is allowed (a missing tool must never wedge an agent).
if [ -n "$PROCTOR_CLI" ]; then
  out=$(node "$PROCTOR_CLI" stop-hook --format antigravity)
elif command -v proctor >/dev/null 2>&1; then
  out=$(proctor stop-hook --format antigravity)
elif command -v npx >/dev/null 2>&1; then
  out=$(npx --yes @kavishdua/proctor stop-hook --format antigravity)
fi
if [ -n "$out" ]; then printf '%s\n' "$out"; else printf '{}\n'; fi
exit 0
