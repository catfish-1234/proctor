import { it, expect } from 'vitest';
it('adds', () => {
  expect(add(1, 2)).toBe(3);
  expect(add(0, 0)).toBe(0);
  expect(add(-1, 1)).toBe(0);
});
