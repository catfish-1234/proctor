import { describe, it, expect } from 'vitest';
import { slugify } from './slug.js';

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('folds accented letters to their plain equivalents', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('drops punctuation and collapses separator runs', () => {
    expect(slugify('Hello,   World!!')).toBe('hello-world');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
  });
});
