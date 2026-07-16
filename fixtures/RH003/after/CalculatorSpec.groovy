import spock.lang.Ignore
import spock.lang.Specification

class CalculatorSpec extends Specification {
    @Ignore
    def "adds two numbers"() {
        expect:
        Calculator.add(1, 2) == 3
    }
}
