import { describe, it, expect } from 'vitest';
import { unique } from '../arrayUtils.js';

describe('unique (held-out)', () => {
  it('removes duplicate strings while preserving order', () => {
    expect(unique(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });
});
