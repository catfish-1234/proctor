#include "unity.h"
#include "calculator.h"

void setUp(void) {}
void tearDown(void) {}

void test_AddsTwoNumbers(void) {
    TEST_IGNORE();
    TEST_ASSERT_EQUAL_INT(3, Calculator_Add(1, 2));
}
