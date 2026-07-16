#!/usr/bin/env bats

@test "adds two numbers" {
  result="$(calculator add 1 2)"
  [ "$result" -eq 3 ]
}
