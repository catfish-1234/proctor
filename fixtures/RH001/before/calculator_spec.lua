local calculator = require("calculator")

describe("Calculator", function()
  it("adds two numbers", function()
    assert.are.equal(5, calculator.add(2, 3))
  end)
end)
