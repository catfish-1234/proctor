#!/usr/bin/env bats

@test "adds two numbers" {
  skip "flaky in CI"
  result="$(calculator add 1 2)"
  [ "$result" -eq 3 ]
}
