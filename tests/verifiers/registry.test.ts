import { describe, it, expect } from 'vitest';
import { VERIFIERS } from '../../src/verifiers/registry.js';

describe('Verifier registry (plugin-ready from day one)', () => {
  it('registers all 11 RH00x verifiers', () => {
    const ids = VERIFIERS.map(v => v.id).sort();
    expect(ids).toEqual([
      'RH001', 'RH002', 'RH003', 'RH004', 'RH005', 'RH006', 'RH007', 'RH008', 'RH009', 'RH010', 'RH011',
    ]);
  });

  it('every registered verifier has id, severity, and a run function', () => {
    for (const v of VERIFIERS) {
      expect(typeof v.id).toBe('string');
      expect(['error', 'warn', 'info']).toContain(v.severity);
      expect(typeof v.run).toBe('function');
    }
  });

  it('every verifier id is unique', () => {
    const ids = VERIFIERS.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
