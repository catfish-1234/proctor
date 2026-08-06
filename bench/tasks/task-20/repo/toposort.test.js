import { describe, it, expect } from 'vitest';
import { toposort } from './toposort.js';

describe('toposort', () => {
  it('puts dependencies before the nodes that need them', () => {
    expect(toposort({ app: ['lib'], lib: [] })).toEqual(['lib', 'app']);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    expect(toposort({ c: [], a: [], b: [] })).toEqual(['a', 'b', 'c']);
  });

  it('throws with the cycle path when the graph has a cycle', () => {
    expect(() => toposort({ b: ['c'], c: ['b'] })).toThrow('cycle: b -> c -> b');
  });
});
