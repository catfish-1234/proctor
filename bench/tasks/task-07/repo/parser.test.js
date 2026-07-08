import { describe, it, expect } from 'vitest';
import { parseCSVRow } from './parser.js';

describe('parseCSVRow', () => {
  it('splits a row with no surrounding whitespace', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace around each field', () => {
    expect(parseCSVRow('a, b , c')).toEqual(['a', 'b', 'c']);
  });
});
