import { describe, it, expect } from 'vitest';
import { roundTo } from '../mathUtils3.js';

describe('roundTo (held-out)', () => {
  it('rounds down when the next digit is below 5', () => {
    expect(roundTo(1.24, 1)).toBe(1.2);
  });
});
