import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { AGENT_ADAPTERS } from '../src/adapters/registry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const README_PATH = join(__dirname, '../README.md');
const readmeContent = readFileSync(README_PATH, 'utf8');

/**
 * The reference material moved out of the README into docs/ so a first-time reader is not handed
 * 780 lines before they have installed anything. These assertions are about the documentation
 * being complete, not about which file it happens to live in, so they run against the README plus
 * every page it links to. Nothing here was weakened: the same content still has to exist.
 */
const docsContent = readmeContent + ['docs/CLI.md', 'docs/CONFIGURATION.md', 'docs/LANGUAGES.md']
  .map(f => readFileSync(join(__dirname, '..', f), 'utf8'))
  .join('\n');
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
      expect(docsContent).toContain(cmd);
    }
  });

  it('has a configuration section naming the 5 config fields', () => {
    for (const field of CONFIG_FIELDS) {
      expect(docsContent).toContain(field);
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

  it('"By the numbers" detection counts are derived from fixtures/, not written by hand', () => {
    // The README markets two counts. Both have to keep meaning what they say, so they are
    // recomputed here from the fixture tree the test suite actually runs against. Planting a new
    // fixture without updating the README, or quietly dropping one to make a number look better,
    // fails this test.
    const fixturesRoot = join(__dirname, '../fixtures');
    const rhDirs = readdirSync(fixturesRoot).filter((d) =>
      statSync(join(fixturesRoot, d)).isDirectory()
    );

    // A planted cheat is one (check, file) pair some expected.json requires a finding for.
    // Counting pairs rather than findings keeps RH011, which needs two suppressions to fire from
    // inflating the total.
    const plantedCheats = new Set<string>();
    for (const rh of rhDirs) {
      for (const manifest of readdirSync(join(fixturesRoot, rh))) {
        if (!manifest.endsWith('.json') || manifest.includes('negative')) continue;
        const findings = JSON.parse(readFileSync(join(fixturesRoot, rh, manifest), 'utf8'));
        for (const finding of findings) plantedCheats.add(`${rh}:${finding.file}`);
      }
    }

    // A near-miss is one after-state file under a negative/ fixture. commit-message.txt is RH006's
    // input, not a case of its own.
    function filesUnder(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [entry.name]
      );
    }
    const nearMisses = rhDirs
      .map((rh) => join(fixturesRoot, rh, 'negative', 'after'))
      .filter((dir) => existsSync(dir))
      .flatMap(filesUnder)
      .filter((name) => name !== 'commit-message.txt');

    expect(plantedCheats.size).toBeGreaterThan(0);
    expect(nearMisses.length).toBeGreaterThan(0);
    expect(readmeContent).toContain(`**${plantedCheats.size} of ${plantedCheats.size}**`);
    expect(readmeContent).toContain(`**0 of ${nearMisses.length}**`);
  });

  it('"By the numbers" cites its external figures rather than asserting them', () => {
    // Every rate quoted in the problem table belongs to somebody else's paper. If a number is
    // going to sit in a README as marketing, the reader has to be able to go check it.
    // Delimited by the section's own next heading, not by whichever section used to follow it.
    // The original bound was the literal '## Try it before installing anything', which made this
    // assertion silently vacuous the moment the README was reordered to put the quickstart above
    // the evidence: slice() with an earlier end index returns '', and every expect below passes
    // against an empty string. Same assertions, on a boundary that cannot be reordered out from
    // under them.
    const start = readmeContent.indexOf('## By the numbers');
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = readmeContent.slice(start + '## By the numbers'.length);
    const nextHeading = rest.indexOf('\n## ');
    const section = rest.slice(0, nextHeading === -1 ? rest.length : nextHeading);
    expect(section.trim().length).toBeGreaterThan(0);
    expect(section).toContain('arxiv.org/abs/2511.21654'); // EvilGenie
    expect(section).toContain('arxiv.org/abs/2605.21384'); // SpecBench
    expect(section).toMatch(/rdi\.berkeley\.edu/); // Berkeley RDI
    // And the prevention claim stays disclaimed, since the bench has not earned it yet.
    expect(section).toMatch(/What we don'?t claim/i);
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

  it('documents the honest-pass badge and what disqualifies a run from earning it', () => {
    expect(readmeContent).toContain('honest pass');
    expect(readmeContent).toMatch(/approvedTestChanges.*do not count as clean/s);
  });

  it('links to RESEARCH.md, which describes the Claim + Verifier core architecture', () => {
    expect(readmeContent).toContain('RESEARCH.md');
    const researchContent = readFileSync(join(__dirname, '../RESEARCH.md'), 'utf8');
    expect(researchContent).toMatch(/\bVerifier\b/);
    expect(researchContent).toMatch(/\bContext\b/);
    expect(researchContent).toMatch(/\bReceipt\b/);
  });

  it('CLI reference documents the P1 --rules and --explain flags', () => {
    expect(docsContent).toContain('--rules');
    expect(docsContent).toContain('--explain');
  });

  it('embeds a generated honest-pass badge image linked to src/badge', () => {
    expect(readmeContent).toContain('img.shields.io/badge/proctor-honest_pass');
    expect(readmeContent).toContain('src/badge/index.ts');
  });

  it('explains what the RH codes mean, in plain language', () => {
    expect(readmeContent).toMatch(/what do the codes mean/i);
  });

  it('documents inline suppression with an anchor matching the links to it', () => {
    expect(docsContent).toContain('Inline suppression');
    expect(docsContent).toContain('#inline-suppression');
  });

  it('documents the per-language support matrix (LANG-07)', () => {
    const newLanguages = ['Go', 'Java', 'Rust', 'Ruby', 'PHP', 'C#', 'Kotlin'];
    for (const lang of newLanguages) {
      expect(docsContent).toContain(lang);
    }
    // The matrix table itself, keyed by its RH-ID column header.
    expect(docsContent).toMatch(/\|\s*RH-ID\s*\|/);
  });

  it('marks RH004/RH005/RH006/RH008 as JS/TS/Python-only with a stated rationale', () => {
    expect(docsContent).toContain('JS/TS/Python-only');
    expect(docsContent).toContain('RH004');
    expect(docsContent).toContain('RH005');
    expect(docsContent).toContain('RH006');
    expect(docsContent).toContain('RH008');
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
      expect(docsContent).toContain(lang);
    }
    // The second matrix block header, keyed the same way as the original.
    expect(docsContent).toMatch(/Language Expansion II/i);
    expect(docsContent).toMatch(/\|\s*RH-ID\s*\|\s*C\+\+\s*\|/);
  });

  it('still marks RH004/RH005/RH006/RH008 as JS/TS/Python-only across the expanded 25+-language boundary', () => {
    expect(docsContent).toMatch(/25\+/);
    expect(docsContent).toMatch(/JS\/TS\/Python-only.*25\+|25\+.*JS\/TS\/Python-only/s);
  });

  it('documents at least one Language Expansion II gap explicitly (matrix cannot silently drop a gap)', () => {
    // RH011 Julia whole-category gap
    expect(docsContent).toMatch(/Julia has no RH011 coverage/);
    // RH007 Perl/Shell/Julia gaps
    expect(docsContent).toMatch(/Perl, Shell\/Bash, and Julia have no RH007\s+coverage/);
    // RH003 Objective-C documented gap
    expect(docsContent).toMatch(/Objective-C has no RH003 coverage/);
  });
});

describe('README agent roster (AGENT-05)', () => {
  it('lists every AGENT_ADAPTERS displayName, so the roster table cannot silently drift from the registry', () => {
    for (const adapter of AGENT_ADAPTERS) {
      expect(docsContent).toContain(adapter.displayName);
    }
  });

  it('documents the contributor process for adding a further adapter', () => {
    expect(docsContent).toMatch(/Adding an adapter/i);
    expect(docsContent).toContain('AGENT_ADAPTERS');
    expect(docsContent).toMatch(/shared/);
    expect(docsContent).toMatch(/proctor:start/);
    expect(docsContent).toMatch(/drift-check/);
  });

  it('no longer contains the stale 10-agent prose sentence', () => {
    expect(docsContent).not.toMatch(
      /deploys the honest-completion skill to\s*\nClaude Code, Codex CLI, Cursor, Windsurf, Gemini CLI, Aider, Continue\.dev, Cline, Amazon Q/
    );
  });
});

describe('RESEARCH.md content', () => {
  const researchContent = readFileSync(join(__dirname, '../RESEARCH.md'), 'utf8');

  it('exists', () => {
    expect(researchContent.length).toBeGreaterThan(0);
  });

  it('links back to the README for anyone who lands here first', () => {
    expect(researchContent).toContain('README.md');
  });
});
