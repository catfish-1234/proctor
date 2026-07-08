import { describe, it, expect } from 'vitest';
import { isPrime } from './mathUtils2.js';

describe('isPrime', () => {
  it('treats 1 as not prime', () => {
    expect(isPrime(1)).toBe(false);
  });

  it('treats 7 as prime', () => {
    expect(isPrime(7)).toBe(true);
  });
});
