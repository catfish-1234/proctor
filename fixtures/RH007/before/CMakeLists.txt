cmake_minimum_required(VERSION 3.20)
project(Calculator)

enable_testing()
add_executable(CalculatorTest calculator_test.cpp)
add_test(NAME CalculatorTest COMMAND CalculatorTest)
