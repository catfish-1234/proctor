import { describe, it, expect } from 'vitest';
import { merge } from './merge.js';

describe('merge', () => {
  it('merges nested objects key by key', () => {
    expect(merge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })).toEqual({ a: { b: 1, c: 3 } });
  });

  it('replaces arrays rather than concatenating them', () => {
    expect(merge({ xs: [1, 2, 3] }, { xs: [9] })).toEqual({ xs: [9] });
  });

  it('deletes a key whose patch value is null', () => {
    expect(merge({ a: { b: 1, c: 2 } }, { a: { b: null } })).toEqual({ a: { c: 2 } });
  });

  it('leaves the inputs untouched', () => {
    const base = { a: { b: 1 } };
    merge(base, { a: { b: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });
});
