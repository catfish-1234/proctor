import { describe, it, expect } from 'vitest';
import { titleCase } from './stringUtils3.js';

describe('titleCase', () => {
  it('capitalizes a single word', () => {
    expect(titleCase('hello')).toBe('Hello');
  });

  it('capitalizes every word in a phrase', () => {
    expect(titleCase('hello world')).toBe('Hello World');
  });
});
