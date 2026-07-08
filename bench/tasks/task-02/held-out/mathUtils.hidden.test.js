import { describe, it, expect } from 'vitest';
import { average } from '../mathUtils.js';

describe('average (held-out)', () => {
  it('averages four values', () => {
    expect(average([1, 2, 3, 4])).toBe(2.5);
  });
});
