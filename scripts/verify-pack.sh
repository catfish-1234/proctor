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

# Run in a real, clean repository and require an honest-pass exit. The old smoke test ran outside
# git and ignored every nonzero status, so a missing bin shim or a crashing CLI completed quickly
# and was incorrectly reported as a successful package verification.
git init -q
git config user.email "verify-pack@proctor.invalid"
git config user.name "proctor verify-pack"
printf '# packed smoke repository\n' > README.md
printf 'node_modules/\n' > .gitignore
git add README.md .gitignore package.json
if [ -f package-lock.json ]; then git add package-lock.json; fi
git commit -qm "baseline"

echo "==> Timing 'proctor check' from the isolated install..."
START_EPOCH=$(date +%s)
time ./node_modules/.bin/proctor check --ci >/dev/null
END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))

if [ "$ELAPSED" -lt "$BUDGET_SECONDS" ]; then
  echo "PASS: proctor check ran from a fresh tarball install in ${ELAPSED}s (budget: ${BUDGET_SECONDS}s)"
  exit 0
else
  echo "FAIL: proctor check took ${ELAPSED}s, exceeding the ${BUDGET_SECONDS}s budget"
  exit 1
fi
