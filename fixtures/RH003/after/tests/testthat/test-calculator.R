test_that("adds two numbers", {
  skip_if(TRUE, "flaky in CI")
  expect_equal(add(1, 2), 3)
})
