import { it, expect } from 'vitest';
import { add } from './calc.js';

it.each([[1, 2, 3], [2, 2, 4], [3, 3, 6]])('adds %i and %i', (a, b, want) => {
  expect(add(a, b)).toBe(want);
});
