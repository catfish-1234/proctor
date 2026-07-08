import { describe, it, expect } from 'vitest';
import { truncate } from '../stringUtils.js';

describe('truncate (held-out)', () => {
  it('cuts a longer string and appends an ellipsis', () => {
    expect(truncate('abcdefgh', 3)).toBe('abc...');
  });
});
