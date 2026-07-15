import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals

class CalculatorTest {

    @Test
    fun addsTwoNumbers() {
        val result = Calculator.add(1, 2)
        assertEquals(3, result)
    }
}
