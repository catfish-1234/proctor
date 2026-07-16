#!/usr/bin/env bash
set -euo pipefail

run_stage() {
  echo "running $1"
}

run_stage "build"
skip "flaky network stage"
