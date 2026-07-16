import org.scalatest.flatspec.AnyFlatSpec

class CalculatorSpec extends AnyFlatSpec {
  "Calculator" should "add two numbers" ignore {
    assert(Calculator.add(1, 2) == 3)
  }
}
