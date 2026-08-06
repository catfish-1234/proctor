import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { APPROVAL_GUIDANCE, RULE_METADATA } from '../src/rules.js';
import { prettyReport } from '../src/reporters/pretty.js';
import { sarifReport } from '../src/reporters/sarif.js';
import type { Finding } from '../src/types.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

function collect(lines: string[]): { write(s: string): void } {
  return { write: (s: string) => void lines.push(s) };
}

describe('fix guidance metadata', () => {
  it('every rule has non-empty fix guidance', () => {
    for (const [id, meta] of Object.entries(RULE_METADATA)) {
      expect(meta.fix, `${id} needs fix guidance`).toBeTruthy();
      expect(meta.fix.length, `${id} fix guidance is too short to be useful`).toBeGreaterThan(80);
    }
  });

  it('no rule leads with the approval escape hatch', () => {
    // The ordering carries the message: fix the code first, approve only as an exception. A rule
    // whose guidance opens with "approve" would invert that.
    for (const [id, meta] of Object.entries(RULE_METADATA)) {
      expect(meta.fix.slice(0, 60).toLowerCase(), `${id} must not lead with approval`).not.toContain('approve');
    }
  });

  it('the shared approval guidance states that an approval does not hide the finding', () => {
    expect(APPROVAL_GUIDANCE).toMatch(/never hides the finding/);
    expect(APPROVAL_GUIDANCE).toMatch(/committed config/);
  });
});

describe('check --explain --fix', () => {
  it('prints the fix guidance and the approval route for a known rule', () => {
    const result = spawnSync('node', [CLI, 'check', '--explain', 'RH001', '--fix'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('How to fix this honestly');
    expect(result.stdout).toContain(RULE_METADATA['RH001']!.fix.slice(0, 40));
    expect(result.stdout).toContain('proctor approve');
  });

  it('rejects --fix without --explain rather than silently ignoring it', () => {
    const result = spawnSync('node', [CLI, 'check', '--fix'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/only applies with --explain/);
  });

  it('rejects an unknown rule ID', () => {
    const result = spawnSync('node', [CLI, 'check', '--explain', 'RH999', '--fix'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
  });

  it('plain --explain points at the fix guidance', () => {
    const result = spawnSync('node', [CLI, 'check', '--explain', 'RH005'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--explain RH005 --fix');
  });
});

describe('findings output points at the fix guidance', () => {
  const err = (id: string): Finding => ({
    verifierId: id, severity: 'error', file: 'a.test.ts', line: 1,
    message: 'something', suggestion: 'do the thing',
  });

  it('names each blocking rule once, deduplicated', () => {
    const lines: string[] = [];
    prettyReport([err('RH001'), err('RH001'), err('RH003')], { stream: collect(lines) });
    const out = lines.join('');
    expect(out).toContain('How to fix these honestly');
    expect(out.match(/--explain RH001 --fix/g)).toHaveLength(1);
    expect(out).toContain('--explain RH003 --fix');
  });

  it('says nothing when there is nothing blocking', () => {
    const lines: string[] = [];
    prettyReport([{ ...err('RH006'), severity: 'warn' }], { stream: collect(lines) });
    expect(lines.join('')).not.toContain('How to fix these honestly');
  });

  it('says nothing on a clean run', () => {
    const lines: string[] = [];
    prettyReport([], { stream: collect(lines) });
    expect(lines.join('')).not.toContain('How to fix these honestly');
  });
});

describe('SARIF carries the fix guidance', () => {
  it('every rule definition includes help text and markdown', () => {
    const sarif = JSON.parse(sarifReport([])) as {
      runs: Array<{ tool: { driver: { rules: Array<{ id: string; help?: { text: string; markdown: string } }> } } }>;
    };
    const rules = sarif.runs[0]!.tool.driver.rules;
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.help?.text, `${rule.id} needs help text`).toBeTruthy();
      expect(rule.help?.markdown, `${rule.id} needs help markdown`).toContain('How to fix this honestly');
      expect(rule.help?.text).toContain(RULE_METADATA[rule.id]!.fix.slice(0, 40));
    }
  });
});
