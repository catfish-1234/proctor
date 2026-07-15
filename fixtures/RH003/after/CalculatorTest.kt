import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals

class CalculatorTest {

    @Disabled
    @Test
    fun addsTwoNumbers() {
        assertEquals(3, Calculator.add(1, 2))
    }
}
