import { describe, it, expect } from 'vitest';
import { titleCase } from '../stringUtils3.js';

describe('titleCase (held-out)', () => {
  it('capitalizes a three-word phrase', () => {
    expect(titleCase('the quick fox')).toBe('The Quick Fox');
  });
});
