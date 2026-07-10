#!/usr/bin/env bash
# scripts/verify-pack.sh
#
# Fresh-machine approximation (D-02, DIST-01): build the real publishable
# tarball via `npm pack`, install it into an isolated temp directory
# (no access to the repo's own node_modules/dist), then time the first
# `proctor check` invocation and assert it completes in under 60 seconds.
#
# This is verification only -- it never runs `npm publish`.

set -euo pipefail

BUDGET_SECONDS=60
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPDIR_VERIFY=""
TARBALL=""

cleanup() {
  cd "$REPO_ROOT"
  if [ -n "$TARBALL" ] && [ -f "$REPO_ROOT/$TARBALL" ]; then
    rm -f "$REPO_ROOT/$TARBALL"
  fi
  if [ -n "$TMPDIR_VERIFY" ] && [ -d "$TMPDIR_VERIFY" ]; then
    rm -rf "$TMPDIR_VERIFY"
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"

echo "==> Building..."
npm run build

echo "==> Packing tarball..."
TARBALL="$(npm pack --silent | tail -n 1)"
echo "    produced: $TARBALL"

# Install and run from a mktemp dir outside the repo tree, so npm/node can't accidentally
# resolve the repo's own node_modules or dist/ instead of the packed tarball's.
TMPDIR_VERIFY="$(mktemp -d)"
echo "==> Installing into isolated temp dir: $TMPDIR_VERIFY"
cd "$TMPDIR_VERIFY"
npm init -y --silent >/dev/null
npm install "$REPO_ROOT/$TARBALL" --no-save --force >/dev/null

echo "==> Timing 'proctor check' from the isolated install..."
# `proctor check` may legitimately exit nonzero here (this temp dir is not a
# git repo) -- that's fine, we're only measuring cold-start invocation time,
# not asserting a clean result. `|| true` prevents `set -e` from aborting.
START_EPOCH=$(date +%s)
time ./node_modules/.bin/proctor check >/dev/null 2>&1 || true
END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))

if [ "$ELAPSED" -lt "$BUDGET_SECONDS" ]; then
  echo "PASS: proctor check ran from a fresh tarball install in ${ELAPSED}s (budget: ${BUDGET_SECONDS}s)"
  exit 0
else
  echo "FAIL: proctor check took ${ELAPSED}s, exceeding the ${BUDGET_SECONDS}s budget"
  exit 1
fi
