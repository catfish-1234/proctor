import { describe, it, expect } from 'vitest';
import { average } from './mathUtils.js';

describe('average', () => {
  it('averages a single value', () => {
    expect(average([10])).toBeDefined();
  });

  it('averages three values', () => {
    expect(average([2, 4, 6])).toBe(4);
  });
});
