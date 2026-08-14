import { describe, it, expect } from 'vitest';
import { satisfies } from '../semver.js';

describe('satisfies (held-out)', () => {
  it('rejects a version below the lower bound', () => {
    expect(satisfies('1.1.9', '^1.2.0')).toBe(false);
  });

  it('accepts a minor bump inside the same major', () => {
    expect(satisfies('1.9.0', '^1.2.0')).toBe(true);
  });

  it('compares numerically, so 10 is above 9', () => {
    expect(satisfies('1.10.0', '^1.9.0')).toBe(true);
  });
});
