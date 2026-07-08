import { describe, it, expect } from 'vitest';
import { reverseString } from './stringUtils2.js';

describe('reverseString', () => {
  it('returns an empty string unchanged', () => {
    expect(reverseString('')).toBe('');
  });

  it('reverses a short word', () => {
    expect(reverseString('abc')).toBe('cba');
  });
});
