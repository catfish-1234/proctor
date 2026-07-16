import 'package:test/test.dart';
import 'package:calculator/calculator.dart';

void main() {
  test('adds two numbers', () {
    final result = add(1, 2);
    expect(result, equals(3));
  });
}
