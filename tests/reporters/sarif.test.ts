import { describe, it, expect } from 'vitest';
import { sarifReport } from '../../src/reporters/sarif.js';
import type { Finding } from '../../src/types.js';

const sample: Finding = {
  ruleId: 'RH001',
  severity: 'error',
  file: 'x.ts',
  line: 1,
  message: 'm',
  remediation: 'r',
};

describe('sarifReport', () => {
  it('empty: produces valid minimal SARIF shape', () => {
    const parsed = JSON.parse(sarifReport([])) as {
      $schema: string;
      version: string;
      runs: Array<{
        tool: { driver: { name: string; version: string; rules: unknown[] } };
        results: unknown[];
      }>;
    };
    expect(parsed.$schema).toBe(
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    );
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].tool.driver.name).toBe('proctor');
    expect(parsed.runs[0].tool.driver.rules).toHaveLength(8);
    expect(parsed.runs[0].results).toEqual([]);
  });

  it('shape: single error finding maps to a SARIF result', () => {
    const parsed = JSON.parse(sarifReport([sample])) as {
      runs: Array<{
        results: Array<{
          ruleId: string;
          level: string;
          message: { text: string };
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: Record<string, unknown>;
            };
          }>;
        }>;
      }>;
    };
    const result = parsed.runs[0].results[0];
    expect(result.ruleId).toBe('RH001');
    expect(result.level).toBe('error');
    expect(result.message.text).toBe('m r');
    const loc = result.locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe('x.ts');
    expect(loc.region.startLine).toBe(1);
    expect(loc.region).not.toHaveProperty('startColumn');
    expect(loc.region).not.toHaveProperty('endColumn');
  });

  it('fingerprint: every result has a stable 64-char hex fingerprint', () => {
    const parsed = JSON.parse(sarifReport([sample])) as {
      runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }>;
    };
    const hash1 = parsed.runs[0].results[0].partialFingerprints.primaryLocationLineHash;
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    const parsedAgain = JSON.parse(sarifReport([sample])) as {
      runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }>;
    };
    const hash2 = parsedAgain.runs[0].results[0].partialFingerprints.primaryLocationLineHash;
    expect(hash2).toBe(hash1);
  });

  it('stability: fingerprint changes with line but not with message/remediation (D-06)', () => {
    const base = JSON.parse(sarifReport([sample])) as {
      runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }>;
    };
    const baseHash = base.runs[0].results[0].partialFingerprints.primaryLocationLineHash;

    const differentLine: Finding = { ...sample, line: 2 };
    const lineChanged = JSON.parse(sarifReport([differentLine])) as {
      runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }>;
    };
    expect(lineChanged.runs[0].results[0].partialFingerprints.primaryLocationLineHash).not.toBe(baseHash);

    const differentMessage: Finding = { ...sample, message: 'totally different message', remediation: 'totally different remediation' };
    const messageChanged = JSON.parse(sarifReport([differentMessage])) as {
      runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }>;
    };
    expect(messageChanged.runs[0].results[0].partialFingerprints.primaryLocationLineHash).toBe(baseHash);
  });

  it('level mapping: warn -> warning, info -> note', () => {
    const warnFinding: Finding = { ...sample, severity: 'warn' };
    const warnParsed = JSON.parse(sarifReport([warnFinding])) as {
      runs: Array<{ results: Array<{ level: string }> }>;
    };
    expect(warnParsed.runs[0].results[0].level).toBe('warning');

    const infoFinding: Finding = { ...sample, severity: 'info' };
    const infoParsed = JSON.parse(sarifReport([infoFinding])) as {
      runs: Array<{ results: Array<{ level: string }> }>;
    };
    expect(infoParsed.runs[0].results[0].level).toBe('note');
  });
});
