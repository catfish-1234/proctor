defmodule CalculatorTest do
  use ExUnit.Case

  @tag :skip
  test "adds two numbers" do
    assert Calculator.add(1, 2) == 3
  end
end
