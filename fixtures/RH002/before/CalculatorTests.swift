import Testing
@testable import Calculator

struct CalculatorTests {
    @Test func addsTwoNumbers() {
        let result: Int? = add(1, 2)
        #expect(result == 3)
    }
}
