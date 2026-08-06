import { describe, it, expect } from 'vitest';
import { merge } from '../merge.js';

describe('merge (held-out)', () => {
  it('adds a key the base did not have', () => {
    expect(merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('deletes a top-level key set to null', () => {
    expect(merge({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
  });
});
