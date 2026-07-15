<?php

use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    public function testAddsTwoNumbers(): void
    {
        $result = Calculator::add(1, 2);
        $this->assertEquals(3, $result);
    }
}
