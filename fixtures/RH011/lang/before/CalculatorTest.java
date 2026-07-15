import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class CalculatorTest {

    @Test
    void addsTwoNumbers() {
        int result = Calculator.add(2, 3);
        assertEquals(5, result);
    }

    @Test
    void subtractsTwoNumbers() {
        int result = Calculator.subtract(5, 2);
        assertEquals(3, result);
    }
}
