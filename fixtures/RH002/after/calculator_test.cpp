#include <catch2/catch_test_macros.hpp>
#include "calculator.hpp"

TEST_CASE("adds two numbers", "[calculator]") {
    int result = add(1, 2);
    REQUIRE(result);
}
