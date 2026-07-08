import { describe, it, expect } from 'vitest';
import { clamp } from '../numberUtils.js';

describe('clamp (held-out)', () => {
  it('leaves an in-range value unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
