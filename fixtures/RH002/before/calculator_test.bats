#!/usr/bin/env bats

load 'test_helper/bats-support/load'
load 'test_helper/bats-assert/load'

@test "add returns the sum" {
  run add 2 3
  assert_equal "$output" "5"
}
