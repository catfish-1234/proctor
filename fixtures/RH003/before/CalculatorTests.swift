import XCTest
@testable import Calculator

final class CalculatorTests: XCTestCase {
    func testAddsTwoNumbers() throws {
        XCTAssertEqual(Calculator.add(1, 2), 3)
    }
}
