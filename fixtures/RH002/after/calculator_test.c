#include "unity.h"
#include "calculator.h"

void test_add(void) {
    int result = add(1, 2);
    TEST_ASSERT_TRUE(result);
}
