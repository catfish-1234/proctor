import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CalculatorTest {

    @Test
    void addsTwoNumbers() {
        int result = Calculator.add(1, 2);
        assertEquals(3, result);
    }
}
