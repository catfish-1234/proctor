import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readTally, recordCaught, resetTally, sessionPath, SESSION_FILENAME } from '../src/session.js';
import { statuslineText } from '../src/brand.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
  execSync('git init', { cwd: dir });
  execSync('git config user.email x@x', { cwd: dir });
  execSync('git config user.name x', { cwd: dir });
  execSync('git commit --allow-empty -m init', { cwd: dir });
  return dir;
}

describe('statusline text', () => {
  it('reads as a state, not a bare number', () => {
    expect(statuslineText(0)).toBe('proctor: watching');
    expect(statuslineText(1)).toBe('proctor: 1 caught');
    expect(statuslineText(7)).toBe('proctor: 7 caught');
  });
});

describe('session tally', () => {
  it('starts empty in a fresh repo', () => {
    const dir = repo();
    try {
      expect(readTally(dir)).toEqual({ caught: 0, recentRules: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stores inside the git dir, so it is never committed and needs no gitignore entry', () => {
    const dir = repo();
    try {
      recordCaught(dir, ['RH001']);
      const path = sessionPath(dir)!;
      expect(path).toContain('.git');
      expect(path.endsWith(SESSION_FILENAME)).toBe(true);
      expect(existsSync(path)).toBe(true);

      const tracked = execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' });
      expect(tracked).not.toContain(SESSION_FILENAME);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accumulates across runs and keeps the rules seen', () => {
    const dir = repo();
    try {
      recordCaught(dir, ['RH001']);
      recordCaught(dir, ['RH003', 'RH002']);
      const tally = readTally(dir);
      expect(tally.caught).toBe(2);
      expect(tally.recentRules).toEqual(['RH001', 'RH003', 'RH002']);
      expect(tally.lastCaughtAt).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps the recent-rules list so the file cannot grow without bound', () => {
    const dir = repo();
    try {
      for (let i = 0; i < 40; i++) recordCaught(dir, ['RH001']);
      expect(readTally(dir).recentRules.length).toBeLessThanOrEqual(20);
      expect(readTally(dir).caught).toBe(40);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a malformed tally as empty rather than throwing', () => {
    const dir = repo();
    try {
      recordCaught(dir, ['RH001']);
      writeFileSync(sessionPath(dir)!, '{ not json', 'utf8');
      expect(readTally(dir)).toEqual({ caught: 0, recentRules: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a wrong-shaped tally as empty', () => {
    const dir = repo();
    try {
      recordCaught(dir, ['RH001']);
      writeFileSync(sessionPath(dir)!, JSON.stringify({ caught: 'lots' }), 'utf8');
      expect(readTally(dir)).toEqual({ caught: 0, recentRules: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing outside a git repository instead of failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      expect(sessionPath(dir)).toBeUndefined();
      expect(() => recordCaught(dir, ['RH001'])).not.toThrow();
      expect(readTally(dir)).toEqual({ caught: 0, recentRules: [] });
      expect(resetTally(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reset clears the count', () => {
    const dir = repo();
    try {
      recordCaught(dir, ['RH001']);
      expect(resetTally(dir)).toBe(true);
      expect(readTally(dir).caught).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('statusline command', () => {
  it('prints the watching state in a clean repo and exits 0', () => {
    const dir = repo();
    try {
      const result = spawnSync('node', [CLI, 'statusline', '--plain'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('proctor: watching');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never fails outside a git repository, since a status bar polls it constantly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'statusline', '--plain'], { cwd: dir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('proctor: watching');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts a turn the Stop hook actually blocked', () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, 'a.test.ts'), "it('x', () => { expect(1).toBe(1); });\n", 'utf8');
      execSync('git add -A && git commit -m base', { cwd: dir });
      writeFileSync(join(dir, 'a.test.ts'), "it.skip('x', () => {});\n", 'utf8');
      execSync('git add -A', { cwd: dir });

      const hook = spawnSync('node', [CLI, 'stop-hook'], { cwd: dir, input: '{}', encoding: 'utf8' });
      expect(hook.status).toBe(2);

      const line = spawnSync('node', [CLI, 'statusline', '--plain'], { cwd: dir, encoding: 'utf8' });
      expect(line.stdout.trim()).toBe('proctor: 1 caught');
      expect(readTally(dir).recentRules).toContain('RH003');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not count a turn that passed', () => {
    const dir = repo();
    try {
      const hook = spawnSync('node', [CLI, 'stop-hook'], { cwd: dir, input: '{}', encoding: 'utf8' });
      expect(hook.status).toBe(0);
      expect(readTally(dir).caught).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
