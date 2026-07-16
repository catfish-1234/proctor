#include <gtest/gtest.h>
#include "calculator.h"

TEST(CalculatorTest, AddsTwoNumbers) {
    EXPECT_EQ(Calculator::Add(1, 2), 3);
}
