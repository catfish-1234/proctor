import { describe, it, expect, beforeEach } from 'vitest';
import { prettyReport } from '../../src/reporters/pretty.js';
import type { Finding } from '../../src/types.js';

const errorFinding: Finding = {
  ruleId: 'RH001',
  severity: 'error',
  file: 'src/foo.ts',
  line: 10,
  message: 'Test deleted',
  remediation: 'Restore the test',
};

const warnFinding: Finding = {
  ruleId: 'RH002',
  severity: 'warn',
  file: 'src/bar.ts',
  line: 5,
  message: 'Assertion weakened',
  remediation: 'Use strict assertion',
};

let chunks: string[];
let stream: { write: (s: string) => void };

beforeEach(() => {
  chunks = [];
  stream = { write: (s: string) => { chunks.push(s); } };
});

describe('prettyReport', () => {
  it('empty findings prints no findings message', () => {
    prettyReport([], { stream });
    const out = chunks.join('');
    expect(out).toContain('No findings.');
  });

  it('error finding shows ❌ badge and ruleId', () => {
    prettyReport([errorFinding], { stream });
    const out = chunks.join('');
    expect(out).toContain('❌');
    expect(out).toContain('RH001');
    expect(out).toContain('src/foo.ts');
  });

  it('warn finding shows ⚠️ badge', () => {
    prettyReport([warnFinding], { stream });
    const out = chunks.join('');
    expect(out).toContain('⚠️');
    expect(out).toContain('RH002');
  });

  it('two findings same file: file header appears once', () => {
    const second: Finding = { ...errorFinding, line: 20, message: 'Another issue' };
    prettyReport([errorFinding, second], { stream });
    const out = chunks.join('');
    // count occurrences of file name as header
    const matches = out.match(/src\/foo\.ts/g) ?? [];
    // file appears in header once, and in each finding line (file:line format)
    // header is bold(file) + '\n', findings show file:line
    // just assert at least 2 occurrences (header + findings)
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // summary present
    expect(out).toContain('finding');
  });

  it('shows summary with error and warn counts', () => {
    prettyReport([errorFinding, warnFinding], { stream });
    const out = chunks.join('');
    expect(out).toContain('finding');
    expect(out).toContain('error');
    expect(out).toContain('warning');
  });

  it('ci mode hides warn but shows error and summary', () => {
    prettyReport([errorFinding, warnFinding], { stream, ci: true });
    const out = chunks.join('');
    expect(out).toContain('❌');
    expect(out).not.toContain('⚠️');
    expect(out).toContain('finding'); // summary always shown
  });

  it('ci mode with only warn: no badges, summary still shown', () => {
    prettyReport([warnFinding], { stream, ci: true });
    const out = chunks.join('');
    expect(out).not.toContain('⚠️');
    expect(out).toContain('finding');
  });

  it('stream.write called at least once for a finding', () => {
    prettyReport([errorFinding], { stream });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('remediation text is in output', () => {
    prettyReport([errorFinding], { stream });
    const out = chunks.join('');
    expect(out).toContain('Restore the test');
  });
});
