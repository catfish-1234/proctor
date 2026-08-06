import { describe, it, expect } from 'vitest';
import { parseRow } from './csv.js';

describe('parseRow', () => {
  it('splits plain unquoted fields', () => {
    expect(parseRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseRow('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseRow('a,"b""c",d')).toEqual(['a', 'b"c', 'd']);
  });
});
