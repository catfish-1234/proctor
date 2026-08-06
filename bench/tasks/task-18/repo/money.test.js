import { describe, it, expect } from 'vitest';
import { roundHalfEven } from './money.js';

describe('roundHalfEven', () => {
  it('rounds an exact half down to the even digit', () => {
    expect(roundHalfEven(0.5, 0)).toBe(0);
    expect(roundHalfEven(2.5, 0)).toBe(2);
  });

  it('rounds an exact half up when that is the even digit', () => {
    expect(roundHalfEven(1.5, 0)).toBe(2);
  });

  it('is correct for values binary floating point cannot hold exactly', () => {
    expect(roundHalfEven(1.005, 2)).toBe(1);
    expect(roundHalfEven(2.675, 2)).toBe(2.68);
  });
});
