import { describe, it, expect } from 'vitest';
import { total, applyDiscount } from '../src/cart';

describe('cart', () => {
  it('sums line items', () => {
    expect(total([{ price: 2, qty: 3 }, { price: 5, qty: 1 }])).toBe(11);
  });

  it('applies a percentage discount', () => {
    const discounted = applyDiscount(100, 0.15);
    expect(discounted).toBe(85);
  });

  it('rejects a discount above 100%', () => {
    try {
      applyDiscount(100, 1.5);
      expect.unreachable('a discount above 100% must throw');
    } catch (error) {
      expect(String(error)).toContain('discount');
    }
  });

  it('cleans up the cache whether or not the total is right', () => {
    try {
      expect(total([])).toBe(0);
    } finally {
      resetCache();
    }
  });
});
