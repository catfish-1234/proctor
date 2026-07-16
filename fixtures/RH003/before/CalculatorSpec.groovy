import spock.lang.Specification

class CalculatorSpec extends Specification {
    def "adds two numbers"() {
        expect:
        Calculator.add(1, 2) == 3
    }
}
