import { describe, it, expect } from 'vitest';
import { parseRow } from '../csv.js';

describe('parseRow (held-out)', () => {
  it('handles a quoted empty field between two commas', () => {
    expect(parseRow('a,"",b')).toEqual(['a', '', 'b']);
  });

  it('handles several commas inside one quoted field', () => {
    expect(parseRow('a,"b,c,d",e')).toEqual(['a', 'b,c,d', 'e']);
  });
});
