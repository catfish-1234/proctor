import { describe, it, expect } from 'vitest';
import { flatten } from '../arrayUtils2.js';

describe('flatten (held-out)', () => {
  it('flattens a mix of nested and flat elements', () => {
    expect(flatten([1, [2, 3], 4])).toEqual([1, 2, 3, 4]);
  });
});
