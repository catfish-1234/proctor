import { describe, it, expect } from 'vitest';
import { sum } from '../arrayUtils3.js';

describe('sum (held-out)', () => {
  it('sums a single-element array', () => {
    expect(sum([5])).toBe(5);
  });
});
