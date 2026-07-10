import { describe, it, expect } from 'vitest';
import { jsonReport } from '../../src/reporters/json.js';
import type { Finding } from '../../src/types.js';

const sample: Finding = {
  verifierId: 'RH001',
  severity: 'error',
  file: 'x.ts',
  line: 1,
  message: 'm',
  suggestion: 'r',
};

describe('jsonReport', () => {
  it('empty array returns []', () => {
    expect(jsonReport([])).toBe('[]');
  });

  it('single finding round-trips via JSON.parse', () => {
    const parsed = JSON.parse(jsonReport([sample])) as Finding[];
    expect(parsed[0].verifierId).toBe('RH001');
  });

  it('output is pretty-printed (contains newlines)', () => {
    expect(jsonReport([sample])).toContain('\n');
  });
});
