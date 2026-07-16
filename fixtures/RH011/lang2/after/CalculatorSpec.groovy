class CalculatorSpec extends Specification {
    @SuppressWarnings("unchecked")
    def "adds two numbers"() {
        expect:
        Calculator.add(2, 3) == 5
    }

    @SuppressWarnings("unchecked")
    def "subtracts two numbers"() {
        expect:
        Calculator.subtract(5, 2) == 3
    }
}
