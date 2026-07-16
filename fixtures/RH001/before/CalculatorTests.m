#import <XCTest/XCTest.h>
#import "Calculator.h"

@interface CalculatorTests : XCTestCase
@end

@implementation CalculatorTests

- (void)testAdds {
    XCTAssertEqual([Calculator add:1 and:2], 3);
}

@end
