import { describe, it, expect } from 'vitest';
import { rh010 } from '../../src/verifiers/rh010.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH010'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

function fileWith(content: string, ln = 5): ParsedFile[] {
  return [{
    from: 'network.test.ts',
    to: 'network.test.ts',
    chunks: [{
      content: '',
      changes: [{ type: 'add', add: true, ln, content }],
      oldStart: ln - 1, oldLines: 1, newStart: ln - 1, newLines: 1,
    }],
    deleted: false,
    new: false,
  }];
}

describe('rh010 — failure masking detection', () => {
  it('flags jest.retryTimes(5) — retry abuse', () => {
    const findings = rh010.run({ ...baseCtx, files: fileWith('+  jest.retryTimes(5);') });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH010');
    expect(findings[0].severity).toBe('warn');
  });

  it('returns [] for jest.retryTimes(1) — a single retry is common for flaky infra (near-miss)', () => {
    const findings = rh010.run({ ...baseCtx, files: fileWith('+  jest.retryTimes(1);') });
    expect(findings).toEqual([]);
  });

  it('flags jest.setTimeout(300000) — an unusually large timeout', () => {
    const findings = rh010.run({ ...baseCtx, files: fileWith('+  jest.setTimeout(300000);') });
    expect(findings.length).toBe(1);
  });

  it('returns [] for jest.setTimeout(10000) — a modest timeout (near-miss)', () => {
    const findings = rh010.run({ ...baseCtx, files: fileWith('+  jest.setTimeout(10000);') });
    expect(findings).toEqual([]);
  });

  it('flags @pytest.mark.flaky(reruns=5)', () => {
    const findings = rh010.run({ ...baseCtx, files: fileWith('+@pytest.mark.flaky(reruns=5)') });
    expect(findings.length).toBe(1);
  });

  it('flags @pytest.mark.timeout(600)', () => {
    const findings = rh010.run({ ...baseCtx, files: fileWith('+@pytest.mark.timeout(600)') });
    expect(findings.length).toBe(1);
  });

  it('flags a network mock that returns literally the test\'s expected assertion value', () => {
    const files: ParsedFile[] = [{
      from: 'network.test.ts',
      to: 'network.test.ts',
      chunks: [{
        content: '',
        changes: [
          { type: 'add', add: true, ln: 3, content: "+  fetchMock.mockResolvedValue('cached-answer');" },
          { type: 'add', add: true, ln: 4, content: "+  expect(result).toBe('cached-answer');" },
        ],
        oldStart: 3, oldLines: 0, newStart: 3, newLines: 2,
      }],
      deleted: false,
      new: false,
    }];
    const findings = rh010.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('cached-answer');
  });

  it('returns [] when the mocked value differs from the asserted value (near-miss)', () => {
    const files: ParsedFile[] = [{
      from: 'network.test.ts',
      to: 'network.test.ts',
      chunks: [{
        content: '',
        changes: [
          { type: 'add', add: true, ln: 3, content: "+  fetchMock.mockResolvedValue({ id: '1' });" },
          { type: 'add', add: true, ln: 4, content: "+  expect(result).toBe(computeExpected());" },
        ],
        oldStart: 3, oldLines: 0, newStart: 3, newLines: 2,
      }],
      deleted: false,
      new: false,
    }];
    const findings = rh010.run({ ...baseCtx, files });
    expect(findings).toEqual([]);
  });

  it('returns [] for a non-test file', () => {
    const findings = rh010.run({
      ...baseCtx,
      files: [{ ...fileWith('+  jest.retryTimes(5);')[0]!, from: 'src/network.ts', to: 'src/network.ts' }],
    });
    expect(findings).toEqual([]);
  });
});
