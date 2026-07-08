import { describe, it, expect } from 'vitest';
import { isValidSlug } from './validators.js';

describe('isValidSlug', () => {
  it('accepts a simple lowercase slug', () => {
    expect(isValidSlug('my-post-title')).toBe(true);
  });

  it('rejects a slug with uppercase letters', () => {
    expect(isValidSlug('My-Post-Title')).toBe(false);
  });
});
