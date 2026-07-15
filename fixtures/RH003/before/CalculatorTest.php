<?php

use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    public function testAddsTwoNumbers(): void
    {
        $this->assertEquals(3, Calculator::add(1, 2));
    }
}
