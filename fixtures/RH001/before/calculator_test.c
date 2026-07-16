#include "unity.h"
#include "calculator.h"

void setUp(void) {}
void tearDown(void) {}

void test_Adds(void) {
    TEST_ASSERT_EQUAL(3, calculator_add(1, 2));
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_Adds);
    return UNITY_END();
}
