import { describe, it, expect } from 'vitest';
import { roundTo } from './mathUtils3.js';

describe('roundTo', () => {
  it('leaves an exact value unchanged', () => {
    expect(roundTo(1.5, 1)).toBe(1.5);
  });

  it('rounds up when the next digit is 5 or higher', () => {
    expect(roundTo(1.25, 1)).toBe(1.3);
  });
});
