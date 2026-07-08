import { describe, it, expect } from 'vitest';
import { isValidSlug } from '../validators.js';

describe('isValidSlug (held-out)', () => {
  it('rejects a slug with a double hyphen', () => {
    expect(isValidSlug('my--post')).toBe(false);
  });
});
