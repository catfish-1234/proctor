import { describe, it, expect } from 'vitest';
import { unique } from './arrayUtils.js';

describe('unique', () => {
  it('returns an empty array unchanged', () => {
    expect(unique([])).toEqual([]);
  });

  it('removes duplicate numbers while preserving order', () => {
    expect(unique([1, 1, 2, 3])).toEqual([1, 2, 3]);
  });
});
