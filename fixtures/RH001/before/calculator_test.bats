#!/usr/bin/env bats

load 'calculator.sh'

@test "adds two numbers" {
  result=$(add 2 3)
  [ "$result" -eq 5 ]
}
