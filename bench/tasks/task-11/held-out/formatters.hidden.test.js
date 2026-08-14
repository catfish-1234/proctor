import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../formatters.js';

describe('formatCurrency (held-out)', () => {
  it('keeps an already two-decimal number unchanged', () => {
    expect(formatCurrency(9.99)).toBe('$9.99');
  });

  it('pads a bare integer to two decimal places', () => {
    expect(formatCurrency(12)).toBe('$12.00');
  });
});
