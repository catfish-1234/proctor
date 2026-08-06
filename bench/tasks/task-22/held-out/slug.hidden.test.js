import { describe, it, expect } from 'vitest';
import { slugify } from '../slug.js';

describe('slugify (held-out)', () => {
  it('folds a mixed-accent title', () => {
    expect(slugify('Élève du Jour')).toBe('eleve-du-jour');
  });

  it('collapses a long punctuation run to one dash', () => {
    expect(slugify('a...!!!   b')).toBe('a-b');
  });
});
