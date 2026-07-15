import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class CalculatorTest {

    @Test
    void addsTwoNumbers() {
        int result = Calculator.add(1, 2);
        assertNotNull(result);
    }
}
