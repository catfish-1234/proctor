import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { AGENT_ADAPTERS } from '../src/adapters/registry.js';

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
  'aiModel',
  'snapshotGlobs',
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

  it('embeds the logo', () => {
    expect(readmeContent).toContain('assets/proctor-logo.svg');
  });

  it('features the exam-invigilator character and launch line', () => {
    expect(readmeContent).toMatch(/exam invigilator/i);
    expect(readmeContent).toMatch(/deleted the test and told you it passed/i);
  });

  it('mentions the statusline badge and honest-pass badge concepts', () => {
    expect(readmeContent).toMatch(/statusline badge/i);
    expect(readmeContent).toContain('honest pass');
  });

  it('links to RESEARCH.md, which describes the Claim + Verifier core architecture', () => {
    expect(readmeContent).toContain('RESEARCH.md');
    const researchContent = readFileSync(join(__dirname, '../RESEARCH.md'), 'utf8');
    expect(researchContent).toMatch(/\bVerifier\b/);
    expect(researchContent).toMatch(/\bContext\b/);
    expect(researchContent).toMatch(/\bReceipt\b/);
  });

  it('CLI reference documents the P1 --rules and --explain flags', () => {
    expect(readmeContent).toContain('--rules');
    expect(readmeContent).toContain('--explain');
  });

  it('embeds a generated honest-pass badge image linked to src/badge', () => {
    expect(readmeContent).toContain('img.shields.io/badge/proctor-honest_pass');
    expect(readmeContent).toContain('src/badge/index.ts');
  });

  it('has no em dashes', () => {
    expect(readmeContent).not.toContain('—');
  });

  it('explains what the RH codes mean, in plain language', () => {
    expect(readmeContent).toMatch(/what do the codes mean/i);
  });

  it('documents inline suppression with an anchor matching the links to it', () => {
    expect(readmeContent).toContain('Inline suppression');
    expect(readmeContent).toContain('#inline-suppression');
  });

  it('documents the per-language support matrix (LANG-07)', () => {
    const newLanguages = ['Go', 'Java', 'Rust', 'Ruby', 'PHP', 'C#', 'Kotlin'];
    for (const lang of newLanguages) {
      expect(readmeContent).toContain(lang);
    }
    // The matrix table itself, keyed by its RH-ID column header.
    expect(readmeContent).toMatch(/\|\s*RH-ID\s*\|/);
  });

  it('marks RH004/RH005/RH006/RH008 as JS/TS/Python-only with a stated rationale', () => {
    expect(readmeContent).toContain('JS/TS/Python-only');
    expect(readmeContent).toContain('RH004');
    expect(readmeContent).toContain('RH005');
    expect(readmeContent).toContain('RH006');
    expect(readmeContent).toContain('RH008');
  });

  it('documents the expanded 16-language support matrix (Language Expansion II, LANG-14)', () => {
    const newerLanguages = [
      'C++',
      'C',
      'Swift',
      'Objective-C',
      'Dart',
      'Scala',
      'Perl',
      'R',
      'Haskell',
      'Elixir',
      'Lua',
      'Groovy',
      'Clojure',
      'Shell/Bash',
      'Julia',
      'VB.NET',
    ];
    for (const lang of newerLanguages) {
      expect(readmeContent).toContain(lang);
    }
    // The second matrix block header, keyed the same way as the original.
    expect(readmeContent).toMatch(/Language Expansion II/i);
    expect(readmeContent).toMatch(/\|\s*RH-ID\s*\|\s*C\+\+\s*\|/);
  });

  it('still marks RH004/RH005/RH006/RH008 as JS/TS/Python-only across the expanded 25+-language boundary', () => {
    expect(readmeContent).toMatch(/25\+/);
    expect(readmeContent).toMatch(/JS\/TS\/Python-only.*25\+|25\+.*JS\/TS\/Python-only/s);
  });

  it('documents at least one Language Expansion II gap explicitly (matrix cannot silently drop a gap)', () => {
    // RH011 Julia whole-category gap
    expect(readmeContent).toMatch(/Julia has no RH011 coverage/);
    // RH007 Perl/Shell/Julia gaps
    expect(readmeContent).toMatch(/Perl, Shell\/Bash, and Julia have no RH007\s+coverage/);
    // RH003 Objective-C documented gap
    expect(readmeContent).toMatch(/Objective-C has no RH003 coverage/);
  });
});

describe('README agent roster (AGENT-05)', () => {
  it('lists every AGENT_ADAPTERS displayName, so the roster table cannot silently drift from the registry', () => {
    for (const adapter of AGENT_ADAPTERS) {
      expect(readmeContent).toContain(adapter.displayName);
    }
  });

  it('documents the contributor process for adding a further adapter', () => {
    expect(readmeContent).toMatch(/Adding an adapter/i);
    expect(readmeContent).toContain('AGENT_ADAPTERS');
    expect(readmeContent).toMatch(/guardExisting/);
    expect(readmeContent).toMatch(/drift-check/);
  });

  it('no longer contains the stale 10-agent prose sentence', () => {
    expect(readmeContent).not.toMatch(
      /deploys the honest-completion skill to\s*\nClaude Code, Codex CLI, Cursor, Windsurf, Gemini CLI, Aider, Continue\.dev, Cline, Amazon Q/
    );
  });
});

describe('RESEARCH.md content', () => {
  const researchContent = readFileSync(join(__dirname, '../RESEARCH.md'), 'utf8');

  it('exists and has no em dashes either', () => {
    expect(researchContent.length).toBeGreaterThan(0);
    expect(researchContent).not.toContain('—');
  });

  it('links back to the README for anyone who lands here first', () => {
    expect(researchContent).toContain('README.md');
  });
});
