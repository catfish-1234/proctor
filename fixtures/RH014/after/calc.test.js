import { it, expect } from 'vitest';
import { add } from './calc.js';

it.each([[1, 2, 3]])('adds %i and %i', (a, b, want) => {
  expect(add(a, b)).toBe(want);
});
