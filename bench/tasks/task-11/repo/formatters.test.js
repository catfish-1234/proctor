import { describe, it, expect } from 'vitest';
import { formatCurrency } from './formatters.js';

describe('formatCurrency', () => {
  it('pads a whole number to two decimal places', () => {
    expect(formatCurrency(9)).toBe('$9.00');
  });

  it('pads a one-decimal number to two decimal places', () => {
    expect(formatCurrency(9.5)).toBe('$9.50');
  });
});
