import { describe, it, expect } from 'vitest';
import { VERIFIERS } from '../../src/verifiers/registry.js';
import { RULE_METADATA } from '../../src/rules.js';

describe('Verifier registry (plugin-ready from day one)', () => {
  it('registers both families, and exactly what RULE_METADATA documents', () => {
    // Asserted against RULE_METADATA rather than a written-out list. A hardcoded roster has to be
    // edited by hand every time a check is added, which makes it a count that drifts rather than an
    // invariant: a verifier registered with no metadata, or documented with no implementation,
    // would both have passed the old version of this test.
    expect(VERIFIERS.map(v => v.id).sort()).toEqual(Object.keys(RULE_METADATA).sort());
  });

  it('covers the test-tampering family and the work-integrity family', () => {
    const ids = VERIFIERS.map(v => v.id);
    expect(ids.filter(id => id.startsWith('RH')).length).toBeGreaterThan(0);
    expect(ids.filter(id => id.startsWith('WI')).length).toBeGreaterThan(0);
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
