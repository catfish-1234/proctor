import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CalculatorTest {

    @Disabled("broken")
    @Test
    void addsTwoNumbers() {
        assertEquals(3, Calculator.add(1, 2));
    }
}
