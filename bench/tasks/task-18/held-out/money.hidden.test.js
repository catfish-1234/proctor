import { describe, it, expect } from 'vitest';
import { roundHalfEven } from '../money.js';

describe('roundHalfEven (held-out)', () => {
  it('leaves a value that needs no rounding alone', () => {
    expect(roundHalfEven(1.23, 2)).toBe(1.23);
  });

  it('rounds a clear majority up', () => {
    expect(roundHalfEven(1.239, 2)).toBe(1.24);
  });

  it('rounds an exact half down to the even digit', () => {
    expect(roundHalfEven(4.5, 0)).toBe(4);
  });
});
