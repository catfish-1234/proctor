import { describe, it, expect } from 'vitest';
import type { Finding, Severity, Context, ProctorConfig, Verifier } from '../src/types.js';

describe('Finding type shape', () => {
  it('has exactly 6 required fields', () => {
    const finding: Finding = {
      verifierId: 'RH001',
      severity: 'error',
      file: 'src/calculator.ts',
      line: 12,
      message: 'Test function deleted.',
      suggestion: 'Restore the deleted test.',
    };

    // Runtime check: all 6 keys present, no extras
    const keys = Object.keys(finding);
    expect(keys).toContain('verifierId');
    expect(keys).toContain('severity');
    expect(keys).toContain('file');
    expect(keys).toContain('line');
    expect(keys).toContain('message');
    expect(keys).toContain('suggestion');
    expect(keys).toHaveLength(6);
  });

  it('Severity accepts error, warn, info', () => {
    const severities: Severity[] = ['error', 'warn', 'info'];
    expect(severities).toHaveLength(3);
  });
});

describe('Context shape', () => {
  it('has all required fields including files[] and isTestFile method', () => {
    const ctx: Context = {
      cwd: '/repo',
      files: [],
      testPathGlobs: ['**/*.test.ts'],
      testFiles: ['src/foo.test.ts'],
      enabled: ['RH001'],
      isTestFile: (p: string) => p.endsWith('.test.ts'),
      getLanguage: () => 'ts',
    };

    expect(ctx.cwd).toBe('/repo');
    expect(ctx.files).toEqual([]);
    expect(ctx.testPathGlobs).toHaveLength(1);
    expect(ctx.testFiles).toHaveLength(1);
    expect(ctx.enabled).toHaveLength(1);
    expect(ctx.isTestFile('foo.test.ts')).toBe(true);
    expect(ctx.isTestFile('foo.ts')).toBe(false);
  });
});

describe('Verifier shape', () => {
  it('has id, severity, and a run(context) function', () => {
    const verifier: Verifier = {
      id: 'RH999',
      severity: 'warn',
      run: () => [],
    };
    expect(verifier.id).toBe('RH999');
    expect(verifier.severity).toBe('warn');
    expect(typeof verifier.run).toBe('function');
  });

  it('run() may return Finding[] synchronously or a Promise<Finding[]>', async () => {
    const syncVerifier: Verifier = { id: 'SYNC', severity: 'error', run: () => [] };
    const asyncVerifier: Verifier = { id: 'ASYNC', severity: 'error', run: async () => [] };
    const emptyCtx: Context = {
      cwd: '', files: [], testPathGlobs: [], testFiles: [], enabled: [],
      isTestFile: () => false, getLanguage: () => 'unknown',
    };
    expect(syncVerifier.run(emptyCtx)).toEqual([]);
    await expect(asyncVerifier.run(emptyCtx)).resolves.toEqual([]);
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
