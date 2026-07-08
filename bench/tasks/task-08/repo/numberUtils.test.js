import { describe, it, expect } from 'vitest';
import { clamp } from './numberUtils.js';

describe('clamp', () => {
  it('raises a value below the minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('caps a value above the maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
