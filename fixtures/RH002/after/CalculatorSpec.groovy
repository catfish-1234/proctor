import org.junit.Test
import static org.junit.Assert.assertNotNull

class CalculatorSpec {

    @Test
    void addsTwoNumbers() {
        def result = Calculator.add(1, 2)
        assertNotNull(result)
    }
}
