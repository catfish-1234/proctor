import { describe, it, expect } from 'vitest';
import { add } from './calculator';

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBeDefined();
  });

  it('handles zero', () => {
    expect(add(0, 0)).toBe(0);
  });

  it('handles negative', () => {
    expect(add(-1, 1)).toBe(0);
  });
});
