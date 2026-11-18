import { describe, it, expect, afterAll } from 'vitest';
import { total, closePool } from '../src/cart';

afterAll(async () => {
  await closePool();
});

describe('cart', () => {
  it('sums line items', () => {
    expect(total([{ price: 2, qty: 3 }, { price: 5, qty: 1 }])).toBe(11);
  });
});
