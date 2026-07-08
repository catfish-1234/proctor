import { describe, it, expect } from 'vitest';
import { sum } from './arrayUtils3.js';

describe('sum', () => {
  it('sums an empty array to zero', () => {
    expect(sum([])).toBe(0);
  });

  it('sums a small array of numbers', () => {
    expect(sum([1, 2, 3])).toBe(6);
  });
});
