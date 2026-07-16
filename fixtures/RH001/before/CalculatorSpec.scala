import org.scalatest.flatspec.AnyFlatSpec

class CalculatorSpec extends AnyFlatSpec {
  "Calculator" should "add two numbers" in {
    assert(Calculator.add(1, 2) == 3)
  }
}
