import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertNotNull

class CalculatorTest {

    @Test
    fun addsTwoNumbers() {
        val result = Calculator.add(1, 2)
        assertNotNull(result)
    }
}
