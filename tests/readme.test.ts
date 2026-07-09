import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const README_PATH = join(__dirname, '../README.md');
const readmeContent = readFileSync(README_PATH, 'utf8');
const BENCH_CSV_PATH = join(__dirname, '../bench/results-live.csv');
const benchCsv = readFileSync(BENCH_CSV_PATH, 'utf8');

const SUBCOMMANDS = [
  'check',
  'install-hook',
  'stop-hook',
  'install-claude-hook',
  'install-skill',
  'drift-check',
  'bench',
];

const CONFIG_FIELDS = [
  'enabled',
  'severity',
  'testPathGlobs',
  'ignorePatterns',
  'approvedTestChanges',
];

describe('README.md content', () => {
  it('exists and has at least 80 lines', () => {
    expect(readmeContent.split('\n').length).toBeGreaterThanOrEqual(80);
  });

  it('contains the wedge sentence (verbatim/close paraphrase from PROJECT.md)', () => {
    expect(readmeContent).toMatch(/deterministic, diff-level guard/i);
    expect(readmeContent).toMatch(/below the agent'?s own reasoning/i);
  });

  it('has an install section referencing npx and @kavishdua/proctor', () => {
    expect(readmeContent).toContain('npx');
    expect(readmeContent).toContain('@kavishdua/proctor');
  });

  it('CLI reference mentions all 7 subcommands', () => {
    for (const cmd of SUBCOMMANDS) {
      expect(readmeContent).toContain(cmd);
    }
  });

  it('has a configuration section naming the 5 config fields', () => {
    for (const field of CONFIG_FIELDS) {
      expect(readmeContent).toContain(field);
    }
  });

  it('embeds the demo GIF', () => {
    expect(readmeContent).toContain('demo.gif');
  });

  it('before/after table numbers are traceable to bench/results-live.csv (no drift)', () => {
    const rows = benchCsv
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.split(','));

    const off = rows.filter((r) => r[2] === 'false');
    const on = rows.filter((r) => r[2] === 'true');

    function pct(subset: string[][], colIndex: number, matchValue: string): string {
      const count = subset.filter((r) => r[colIndex] === matchValue).length;
      return `${((count / subset.length) * 100).toFixed(1)}%`;
    }

    const cheatRateOff = pct(off, 3, 'true');
    const cheatRateOn = pct(on, 3, 'true');
    const honestPassOff = pct(off, 5, 'true');
    const honestPassOn = pct(on, 5, 'true');

    expect(readmeContent).toContain(cheatRateOff);
    expect(readmeContent).toContain(cheatRateOn);
    expect(readmeContent).toContain(honestPassOff);
    expect(readmeContent).toContain(honestPassOn);
  });

  it('links to bench/METHODOLOGY.md and documents a regenerate command', () => {
    expect(readmeContent).toContain('bench/METHODOLOGY.md');
    expect(readmeContent).toMatch(/proctor bench/i);
  });

  it('does not link to the wrong GitHub org (kavishdua) for repo links', () => {
    expect(readmeContent).not.toContain('github.com/kavishdua');
  });
});
