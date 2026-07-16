import org.junit.Test
import static org.junit.Assert.assertEquals

class CalculatorSpec {

    @Test
    void addsTwoNumbers() {
        def result = Calculator.add(1, 2)
        assertEquals(3, result)
    }
}
