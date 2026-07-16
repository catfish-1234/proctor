import org.scalatest.flatspec.AnyFlatSpec

class CalculatorSpec extends AnyFlatSpec {
  "Calculator" should "add two numbers" in {
    val ignore = false
    println(s"ignore flag: $ignore")
    if (!ignore) {
      assert(Calculator.add(1, 2) == 3)
    }
  }
}
