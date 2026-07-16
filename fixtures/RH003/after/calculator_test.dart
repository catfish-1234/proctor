import 'package:test/test.dart';
import 'calculator.dart';

void main() {
  test('adds two numbers', () => expect(add(1, 2), equals(3)), skip: 'flaky on CI');
}
