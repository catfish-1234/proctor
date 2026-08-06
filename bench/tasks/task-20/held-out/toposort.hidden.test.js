import { describe, it, expect } from 'vitest';
import { toposort } from '../toposort.js';

describe('toposort (held-out)', () => {
  it('orders a longer dependency chain', () => {
    expect(toposort({ a: ['b'], b: ['c'], c: [] })).toEqual(['c', 'b', 'a']);
  });

  it('handles a diamond without duplicating a node', () => {
    expect(toposort({ d: ['b', 'c'], b: ['a'], c: ['a'], a: [] })).toEqual(['a', 'b', 'c', 'd']);
  });
});
