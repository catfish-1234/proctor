import XCTest
@testable import Calculator

final class CalculatorTests: XCTestCase {
    func testAdds() {
        XCTAssertEqual(Calculator.add(1, 2), 3)
    }
}
