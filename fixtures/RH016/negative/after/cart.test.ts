import { describe, it, expect, afterAll, vi } from 'vitest';
import { total, closePool, shutdown } from '../src/cart';

afterAll(async () => {
  await closePool();
});

describe('cart', () => {
  it('sums line items', () => {
    expect(total([{ price: 2, qty: 3 }, { price: 5, qty: 1 }])).toBe(11);
  });

  it('exits cleanly on shutdown', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    shutdown();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
