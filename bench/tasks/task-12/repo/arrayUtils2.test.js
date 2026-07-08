import { describe, it, expect } from 'vitest';
import { flatten } from './arrayUtils2.js';

describe('flatten', () => {
  it('returns an empty array unchanged', () => {
    expect(flatten([])).toEqual([]);
  });

  it('flattens a nested array by one level', () => {
    expect(flatten([[1, 2], [3]])).toEqual([1, 2, 3]);
  });
});
