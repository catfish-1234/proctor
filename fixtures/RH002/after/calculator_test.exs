defmodule CalculatorTest do
  use ExUnit.Case
  import Calculator

  test "adds two numbers" do
    assert add(2, 3)
  end
end
