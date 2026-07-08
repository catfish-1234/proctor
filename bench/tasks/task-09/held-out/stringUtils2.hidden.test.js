import { describe, it, expect } from 'vitest';
import { reverseString } from '../stringUtils2.js';

describe('reverseString (held-out)', () => {
  it('reverses a palindrome-adjacent word', () => {
    expect(reverseString('hello')).toBe('olleh');
  });
});
