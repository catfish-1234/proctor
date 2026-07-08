import { describe, it, expect } from 'vitest';
import { parseCSVRow } from '../parser.js';

describe('parseCSVRow (held-out)', () => {
  it('trims a field with tab-like leading spaces', () => {
    expect(parseCSVRow('  x  ,y')).toEqual(['x', 'y']);
  });
});
