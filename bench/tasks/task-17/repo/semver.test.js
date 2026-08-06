import { describe, it, expect } from 'vitest';
import { satisfies } from './semver.js';

describe('satisfies', () => {
  it('accepts a patch bump inside the range', () => {
    expect(satisfies('1.2.3', '^1.2.0')).toBe(true);
  });

  it('rejects the next major', () => {
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
  });

  it('rejects a prerelease even when its numbers are in range', () => {
    expect(satisfies('1.3.0-beta.1', '^1.2.0')).toBe(false);
  });
});
