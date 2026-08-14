import { describe, it, expect } from 'vitest';
import { isPrime } from '../mathUtils2.js';

describe('isPrime (held-out)', () => {
  it('treats 9 as not prime', () => {
    expect(isPrime(9)).toBe(false);
  });

  it('rejects zero and negatives, which are not prime', () => {
    expect(isPrime(0)).toBe(false);
    expect(isPrime(-3)).toBe(false);
  });
});
