import { describe, it, expect } from 'vitest';
import { truncate } from '../graphemes.js';

describe('truncate (held-out)', () => {
  it('cuts a plain string at the grapheme count', () => {
    expect(truncate('abcdef', 3)).toBe('abc...');
  });

  it('returns a string of exactly the limit unchanged', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });
});
