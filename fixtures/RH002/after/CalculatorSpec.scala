import org.scalatest.funsuite.AnyFunSuite

class CalculatorSpec extends AnyFunSuite {
  test("formats a sum") {
    val result = Calculator.formatSum(1, 2)
    assert(result != null)
  }
}
