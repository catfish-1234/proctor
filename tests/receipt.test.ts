import { describe, it, expect } from 'vitest';
import { buildReceipt } from '../src/receipt.js';
import type { Finding } from '../src/types.js';

const errorFinding: Finding = {
  verifierId: 'RH001',
  severity: 'error',
  file: 'src/foo.ts',
  line: 1,
  message: 'm',
  suggestion: 's',
};

const warnFinding: Finding = {
  verifierId: 'RH006',
  severity: 'warn',
  file: 'src/bar.ts',
  line: 2,
  message: 'm',
  suggestion: 's',
};

describe('buildReceipt', () => {
  it('status is "honest-pass" for a clean run (no findings)', () => {
    const receipt = buildReceipt([]);
    expect(receipt.status).toBe('honest-pass');
    expect(receipt.findings).toEqual([]);
  });

  it('status is "honest-pass" for warn-only findings', () => {
    const receipt = buildReceipt([warnFinding]);
    expect(receipt.status).toBe('honest-pass');
  });

  it('status is "caught" when any finding is error-severity', () => {
    const receipt = buildReceipt([warnFinding, errorFinding]);
    expect(receipt.status).toBe('caught');
  });

  it('timestamp is a valid ISO 8601 string derived from the injected clock', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const receipt = buildReceipt([], now);
    expect(receipt.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('signature is undefined in P1 (reserved for a future signed-receipt mechanism)', () => {
    const receipt = buildReceipt([]);
    expect(receipt.signature).toBeUndefined();
  });

  it('findings on the receipt are exactly what was passed in', () => {
    const receipt = buildReceipt([errorFinding]);
    expect(receipt.findings).toEqual([errorFinding]);
  });
});
