import { describe, it, expect } from 'vitest';
import { truncate } from './stringUtils.js';

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('appends an ellipsis when the string is cut', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });
});
