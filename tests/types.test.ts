import { describe, it, expect } from 'vitest';
import type { Finding, Severity, RepoContext, ProctorConfig } from '../src/types.js';

describe('Finding type shape (FOUND-05)', () => {
  it('has exactly 6 required fields', () => {
    const finding: Finding = {
      ruleId: 'RH001',
      severity: 'error',
      file: 'src/calculator.ts',
      line: 12,
      message: 'Test function deleted.',
      remediation: 'Restore the deleted test.',
    };

    // Runtime check: all 6 keys present, no extras
    const keys = Object.keys(finding);
    expect(keys).toContain('ruleId');
    expect(keys).toContain('severity');
    expect(keys).toContain('file');
    expect(keys).toContain('line');
    expect(keys).toContain('message');
    expect(keys).toContain('remediation');
    expect(keys).toHaveLength(6);
  });

  it('Severity accepts error, warn, info', () => {
    const severities: Severity[] = ['error', 'warn', 'info'];
    expect(severities).toHaveLength(3);
  });
});

describe('RepoContext shape', () => {
  it('has all required fields including isTestFile method', () => {
    const ctx: RepoContext = {
      cwd: '/repo',
      testPathGlobs: ['**/*.test.ts'],
      testFiles: ['src/foo.test.ts'],
      enabled: ['RH001'],
      isTestFile: (p: string) => p.endsWith('.test.ts'),
    };

    expect(ctx.cwd).toBe('/repo');
    expect(ctx.testPathGlobs).toHaveLength(1);
    expect(ctx.testFiles).toHaveLength(1);
    expect(ctx.enabled).toHaveLength(1);
    expect(ctx.isTestFile('foo.test.ts')).toBe(true);
    expect(ctx.isTestFile('foo.ts')).toBe(false);
  });
});

describe('ProctorConfig shape', () => {
  it('accepts all 5 optional fields', () => {
    const config: ProctorConfig = {
      enabled: ['RH001'],
      testPathGlobs: ['**/*.test.ts'],
      severity: { RH001: 'warn' },
      ignorePatterns: ['fixtures/**'],
      approvedTestChanges: [],
    };
    expect(config.enabled).toHaveLength(1);
    expect(config.severity?.['RH001']).toBe('warn');
  });

  it('accepts empty config (all fields optional)', () => {
    const config: ProctorConfig = {};
    expect(Object.keys(config)).toHaveLength(0);
  });
});
