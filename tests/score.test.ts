import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildScoreReport, listCommits } from '../src/score.js';
import { scoreReport } from '../src/reporters/score.js';
import type { ScoreReport } from '../src/score.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

function collect(lines: string[]): { write(s: string): void } {
  return { write: (s: string) => void lines.push(s) };
}

/** A repo with one honest commit and one that skips a test rather than fixing it. */
function repoWithHistory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
  const run = (cmd: string): void => void execSync(cmd, { cwd: dir });
  run('git init');
  run('git config user.email x@x');
  run('git config user.name x');
  run('git config core.autocrlf false');

  const one = "it('adds', () => { expect(add(1, 2)).toBe(3); });\n";
  const two = one + "it('subtracts', () => { expect(sub(3, 1)).toBe(2); });\n";
  const skipped = one + "it.skip('subtracts', () => {});\n";

  writeFileSync(join(dir, 'a.test.ts'), one, 'utf8');
  run('git add -A');
  run('git commit -m init');

  writeFileSync(join(dir, 'a.test.ts'), two, 'utf8');
  run('git add -A');
  run('git commit -m "honest: add a test"');

  writeFileSync(join(dir, 'a.test.ts'), skipped, 'utf8');
  run('git add -A');
  run('git commit -m "cheat: skip the failing test"');
  return dir;
}

describe('listCommits', () => {
  it('reads commits newest first with subject and author intact', () => {
    const dir = repoWithHistory();
    try {
      const commits = listCommits(dir, 10);
      expect(commits).toHaveLength(3);
      expect(commits[0]!.subject).toBe('cheat: skip the failing test');
      expect(commits[0]!.author).toBe('x');
      expect(commits[0]!.sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors the limit', () => {
    const dir = repoWithHistory();
    try {
      expect(listCommits(dir, 2)).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildScoreReport', () => {
  it('flags the commit that skipped a test and passes the honest one', async () => {
    const dir = repoWithHistory();
    try {
      const report = await buildScoreReport(dir, 10);
      const cheat = report.commits.find(c => c.subject.startsWith('cheat'))!;
      const honest = report.commits.find(c => c.subject.startsWith('honest'))!;

      expect(cheat.clean).toBe(false);
      expect(cheat.findings.some(f => f.verifierId === 'RH003')).toBe(true);
      expect(honest.clean).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips the initial commit rather than counting it clean, which would flatter the rate', async () => {
    const dir = repoWithHistory();
    try {
      const report = await buildScoreReport(dir, 10);
      expect(report.skipped).toBe(1);
      expect(report.commits).toHaveLength(2);
      expect(report.honestyRate).toBe(0.5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts which rules fired', async () => {
    const dir = repoWithHistory();
    try {
      const report = await buildScoreReport(dir, 10);
      expect(report.topRules.find(r => r.rule === 'RH003')?.count).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('filters by author', async () => {
    const dir = repoWithHistory();
    try {
      expect((await buildScoreReport(dir, 10, 'nobody')).commits).toHaveLength(0);
      expect((await buildScoreReport(dir, 10, 'x')).commits.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('score reporter', () => {
  const base: ScoreReport = {
    commits: [
      {
        sha: 'a'.repeat(40), shortSha: 'aaaaaaa', subject: 'clean one', author: 'x',
        findings: [], clean: true, approved: 0,
      },
      {
        sha: 'b'.repeat(40), shortSha: 'bbbbbbb', subject: 'bad one', author: 'x',
        clean: false, approved: 0,
        findings: [{ verifierId: 'RH003', severity: 'error', file: 'a.test.ts', line: 2, message: 'm', suggestion: 's' }],
      },
    ],
    honestyRate: 0.5,
    topRules: [{ rule: 'RH003', count: 1 }],
    skipped: 1,
  };

  it('states the rate with its denominator, so a small sample cannot pass as a strong one', () => {
    const lines: string[] = [];
    scoreReport(base, { stream: collect(lines) });
    expect(lines.join('')).toContain('50.0%');
    expect(lines.join('')).toContain('1 of 2 commits');
  });

  it('lists only blocked commits by default', () => {
    const lines: string[] = [];
    scoreReport(base, { stream: collect(lines) });
    const out = lines.join('');
    expect(out).toContain('bad one');
    expect(out).not.toContain('clean one');
  });

  it('lists every commit with --all', () => {
    const lines: string[] = [];
    scoreReport(base, { stream: collect(lines), all: true });
    expect(lines.join('')).toContain('clean one');
  });

  it('reports skipped commits rather than hiding them', () => {
    const lines: string[] = [];
    scoreReport(base, { stream: collect(lines) });
    expect(lines.join('')).toMatch(/1 commit\(s\) skipped/);
  });

  it('says so plainly when there is nothing to score', () => {
    const lines: string[] = [];
    scoreReport({ commits: [], honestyRate: undefined, topRules: [], skipped: 0 }, { stream: collect(lines) });
    expect(lines.join('')).toContain('No commits to score.');
  });

  it('calls out findings that passed on an approval rather than on being clean', () => {
    const lines: string[] = [];
    scoreReport({ ...base, commits: [{ ...base.commits[0]!, approved: 2 }] }, { stream: collect(lines) });
    expect(lines.join('')).toMatch(/passed on a recorded approval/);
  });
});

describe('score command', () => {
  it('runs against a real repo and reports a rate', () => {
    const dir = repoWithHistory();
    try {
      const result = spawnSync('node', [CLI, 'score', '--last', '10'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Honesty rate');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits machine-readable JSON with --json', () => {
    const dir = repoWithHistory();
    try {
      const result = spawnSync('node', [CLI, 'score', '--last', '10', '--json'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout) as ScoreReport;
      expect(report.honestyRate).toBe(0.5);
      expect(report.commits).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a nonsense --last instead of silently scoring nothing', () => {
    const dir = repoWithHistory();
    try {
      for (const bad of ['0', '-3', 'abc']) {
        const result = spawnSync('node', [CLI, 'score', '--last', bad], { cwd: dir, encoding: 'utf8' });
        expect(result.status, 'rejected --last ' + bad).toBe(2);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives a clean message outside a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'score'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('proctor:');
      expect(result.stderr).not.toContain('at Command');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('score --min-rate, as a CI honesty gate', () => {
  it('fails when the rate is below the threshold, naming the actual rate', () => {
    // repoWithHistory() has one honest commit and one cheat, so the rate is 50%.
    const dir = repoWithHistory();
    try {
      const result = spawnSync('node', [CLI, 'score', '--min-rate', '90'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/50\.0% is below the required 90%/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when the rate meets the threshold', () => {
    const dir = repoWithHistory();
    try {
      const result = spawnSync('node', [CLI, 'score', '--min-rate', '50'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a threshold outside 0 to 100 rather than gating on nonsense', () => {
    const dir = repoWithHistory();
    try {
      for (const bad of ['-1', '101', 'abc']) {
        const result = spawnSync('node', [CLI, 'score', '--min-rate', bad], { cwd: dir, encoding: 'utf8' });
        expect(result.status, 'rejected --min-rate ' + bad).toBe(2);
        expect(result.stderr).toContain('--min-rate must be a percentage');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes with an explanation when there is no history to score', () => {
    // A repo with only an initial commit has nothing scorable. Failing the gate for having no
    // evidence would block a new repository for being new.
    const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const run = (cmd: string): void => void execSync(cmd, { cwd: dir });
      run('git init');
      run('git config user.email x@x');
      run('git config user.name x');
      writeFileSync(join(dir, 'a.txt'), 'x', 'utf8');
      run('git add -A');
      run('git commit -m init');

      const result = spawnSync('node', [CLI, 'score', '--min-rate', '100'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('no commits could be scored');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
