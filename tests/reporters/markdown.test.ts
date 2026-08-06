import { describe, it, expect } from 'vitest';
import { markdownReport } from '../../src/reporters/markdown.js';
import type { Finding } from '../../src/types.js';

const finding = (over: Partial<Finding> = {}): Finding => ({
  verifierId: 'RH001',
  severity: 'error',
  file: 'tests/calc.test.ts',
  line: 12,
  message: 'Test file deleted.',
  suggestion: 'Put it back.',
  ...over,
});

describe('markdownReport', () => {
  it('says so plainly when nothing fired', () => {
    const md = markdownReport([]);
    expect(md).toContain('## proctor');
    expect(md).toContain('No test tampering found.');
    expect(md).not.toContain('|---|');
  });

  it('renders a table row per finding with rule, location, and message', () => {
    const md = markdownReport([finding()]);
    expect(md).toContain('`RH001`');
    expect(md).toContain('TestDeletedOrRenamed');
    expect(md).toContain('`tests/calc.test.ts`:12');
    expect(md).toContain('Test file deleted.');
  });

  it('counts each severity in the verdict line', () => {
    const md = markdownReport([finding(), finding({ severity: 'warn' }), finding({ severity: 'info' })]);
    expect(md).toContain('1 error');
    expect(md).toContain('1 warning');
    expect(md).toContain('1 info');
  });

  it('shows the approval reason instead of the suggestion for an approved finding', () => {
    // An approved finding was already decided on, so a reviewer needs the decision, not advice.
    const md = markdownReport([finding({ severity: 'info', approved: true, approvalReason: 'suite moved to e2e/' })]);
    expect(md).toContain('**Approved:** suite moved to e2e/');
    expect(md).toContain('1 approved');
  });

  it('expands fix guidance only for rules that actually blocked', () => {
    // Printing all twelve every run would bury the one that mattered.
    const md = markdownReport([finding(), finding({ verifierId: 'RH011', severity: 'warn' })]);
    expect(md).toContain('How to fix RH001 honestly');
    expect(md).not.toContain('How to fix RH011 honestly');
  });

  it('lists each blocking rule once however many times it fired', () => {
    const md = markdownReport([finding(), finding({ line: 40 })]);
    expect(md.match(/How to fix RH001 honestly/g)).toHaveLength(1);
  });

  it('neutralizes pipes and newlines so a message cannot break out of its cell', () => {
    const md = markdownReport([finding({ message: 'a | b\nc' })]);
    expect(md).toContain('a \\| b c');
    const tableRows = md.split('\n').filter(l => l.startsWith('| error'));
    expect(tableRows).toHaveLength(1);
  });
});
