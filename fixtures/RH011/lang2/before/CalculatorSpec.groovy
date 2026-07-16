class CalculatorSpec extends Specification {
    def "adds two numbers"() {
        expect:
        Calculator.add(2, 3) == 5
    }

    def "subtracts two numbers"() {
        expect:
        Calculator.subtract(5, 2) == 3
    }
}
