#import <XCTest/XCTest.h>
#import "Calculator.h"

@interface CalculatorTests : XCTestCase
@end

@implementation CalculatorTests

- (void)testAddsTwoNumbers {
    NSInteger result = add(1, 2);
    XCTAssertTrue(result);
}

@end
