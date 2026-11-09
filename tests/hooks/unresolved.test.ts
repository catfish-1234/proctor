import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  cliCheckRunner, currentHead, readUnresolved, recordUnresolved, unresolvedPath, verifyUnresolved, type CheckRunner,
} from '../../src/hooks/unresolved.js';
import { ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS, stopHookPolicy } from '../../src/hooks/stop-hook.js';
import { preCommitHookContent } from '../../src/hooks/pre-commit.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');
const seed = "it('a', () => { expect(1).toBe(1); });\nit('b', () => { expect(2).toBe(2); });\n";
const cheated = "it('a', () => { expect(1).toBe(1); });\n";

let dir: string;
let tmp: string;
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
const rec = (findings = '[RH001] deleted', extra: Partial<Parameters<typeof recordUnresolved>[0]> = {}) =>
  recordUnresolved({ cwd: dir, source: 'antigravity-stop-hook', conversationId: 'conv-1', findings, blockBudget: 5, ...extra });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proctor-unres-'));
  tmp = mkdtempSync(join(tmpdir(), 'proctor-unres-tmp-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'T');
  writeFileSync(join(dir, 'a.test.ts'), seed);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'seed');
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); });

describe('unresolved record', () => {
  it('records provenance and the finding, and nothing from a transcript', () => {
    const path = rec('[RH001] Test function b was deleted');
    expect(path).toBe(unresolvedPath(dir));
    const r = readUnresolved(dir);
    expect(r.state).toBe('unresolved');
    if (r.state !== 'unresolved') throw new Error('expected unresolved');
    expect(r.record).toMatchObject({ schema: 1, source: 'antigravity-stop-hook', conversationId: 'conv-1', baseHead: currentHead(dir), occurrences: 1, blockBudget: 5 });
    expect(r.record.originalFindings).toContain('RH001');
    expect(Object.keys(r.record).sort()).toEqual(['baseHead', 'blockBudget', 'conversationId', 'firstSeenAt', 'lastSeenAt', 'latestFindings', 'occurrences', 'originalFindings', 'schema', 'source']);
    expect(existsSync(join(dir, 'proctor'))).toBe(false); // lives in the git dir, not the worktree
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });

  it('keeps the original finding, first baseline and first time on later records', () => {
    rec('first');
    const first = readUnresolved(dir);
    writeFileSync(join(dir, 'x.txt'), 'x'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'later');
    rec('second', { now: new Date('2030-01-01T00:00:00Z') });
    const r = readUnresolved(dir);
    if (r.state !== 'unresolved' || first.state !== 'unresolved') throw new Error('expected unresolved');
    expect(r.record.occurrences).toBe(2);
    expect(r.record.originalFindings).toBe('first');
    expect(r.record.latestFindings).toBe('second');
    expect(r.record.baseHead).toBe(first.record.baseHead);
    expect(r.record.firstSeenAt).toBe(first.record.firstSeenAt);
    expect(r.record.lastSeenAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('caps stored finding text', () => {
    rec('x'.repeat(50_000));
    const r = readUnresolved(dir);
    if (r.state !== 'unresolved') throw new Error('expected unresolved');
    expect(r.record.originalFindings.length).toBeLessThan(8100);
  });

  it('is per worktree: a linked worktree has its own state under its own git dir', () => {
    const wt = join(tmp, 'wt');
    git(dir, 'worktree', 'add', '-q', wt, '-b', 'other');
    recordUnresolved({ cwd: wt, source: 's', findings: 'in worktree', blockBudget: 5 });
    expect(readUnresolved(wt).state).toBe('unresolved');
    expect(readUnresolved(dir).state).toBe('none');
    expect(unresolvedPath(wt)).toContain(join('worktrees', 'wt'));
  });

  it('does nothing outside a git repository', () => {
    expect(recordUnresolved({ cwd: tmp, source: 's', findings: 'f', blockBudget: 5 })).toBeUndefined();
    expect(readUnresolved(tmp)).toEqual({ state: 'none' });
  });

  it('survives many sequential updates and recovers from a stale lock', () => {
    const path = rec('one')!;
    writeFileSync(path + '.lock', '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(path + '.lock', old, old);
    for (let n = 0; n < 20; n++) rec(`n${n}`);
    const r = readUnresolved(dir);
    if (r.state !== 'unresolved') throw new Error('expected unresolved');
    expect(r.record.occurrences).toBe(21);
    expect(existsSync(path + '.lock')).toBe(false);
  });
});

describe('verifyUnresolved', () => {
  const calls: string[][] = [];
  const runner = (...codes: Array<number | null>): CheckRunner => {
    let i = 0;
    return (_cwd, args) => { calls.push(args); return codes[Math.min(i++, codes.length - 1)] ?? null; };
  };
  beforeEach(() => { calls.length = 0; });

  it('reports none when nothing is recorded', () => {
    expect(verifyUnresolved(dir, runner(0))).toEqual({ status: 'none' });
  });

  it('clears only after the working tree AND the commits since the baseline both check clean', () => {
    rec();
    expect(verifyUnresolved(dir, runner(0, 1))).toEqual({ status: 'cleared' });
    expect(calls).toEqual([['--uncommitted'], ['--base', currentHead(dir)]]);
    expect(readUnresolved(dir).state).toBe('none');
  });

  it('keeps the record when any part of the check finds something', () => {
    rec();
    expect(verifyUnresolved(dir, runner(0, 2)).status).toBe('unresolved');
    expect(readUnresolved(dir).state).toBe('unresolved');
    expect(verifyUnresolved(dir, runner(2)).status).toBe('unresolved');
  });

  it.each([3, 127, null])('treats exit %s as unverified, never clean, and keeps the record', code => {
    rec();
    const v = verifyUnresolved(dir, runner(code));
    expect(v.status).toBe('unverified');
    expect(readUnresolved(dir).state).toBe('unresolved');
  });

  it('is unverified when the baseline commit is gone, without running a check', () => {
    rec();
    const path = unresolvedPath(dir)!;
    const r = JSON.parse(readFileSync(path, 'utf8'));
    r.baseHead = 'deadbeef'.repeat(5);
    writeFileSync(path, JSON.stringify(r));
    expect(verifyUnresolved(dir, runner(0)).status).toBe('unverified');
    expect(calls).toEqual([]);
  });

  it('treats a corrupt record as unverified and leaves it in place', () => {
    rec();
    const path = unresolvedPath(dir)!;
    writeFileSync(path, '{not json');
    expect(readUnresolved(dir).state).toBe('corrupt');
    expect(verifyUnresolved(dir, runner(0)).status).toBe('unverified');
    expect(existsSync(path)).toBe(true);
    writeFileSync(path, JSON.stringify({ schema: 99 }));
    expect(readUnresolved(dir).state).toBe('corrupt');
  });

  it('a commit that hides the cheat does not clear it (real CLI)', () => {
    writeFileSync(join(dir, 'a.test.ts'), cheated);
    rec();
    git(dir, 'commit', '-qam', 'agent commits the deletion');
    // Working tree is now clean, so an --uncommitted-only check would pass. The baseline range must not.
    const v = verifyUnresolved(dir, cliCheckRunner(CLI));
    expect(v.status).toBe('unresolved');
    expect(readUnresolved(dir).state).toBe('unresolved');
    writeFileSync(join(dir, 'a.test.ts'), seed);
    git(dir, 'commit', '-qam', 'restore the test');
    expect(verifyUnresolved(dir, cliCheckRunner(CLI))).toEqual({ status: 'cleared' });
  });
});

describe('proctor unresolved CLI and hook wiring', () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });

  it('status exits 0 when none, 2 when unresolved, 3 when corrupt', () => {
    expect(cli('unresolved').status).toBe(0);
    rec('[RH001] deleted');
    const s = cli('unresolved');
    expect(s.status).toBe(2);
    expect(s.stdout).toContain('UNRESOLVED');
    expect(s.stdout).toContain('RH001');
    expect(s.stdout).toContain('CI on the pushed diff');
    writeFileSync(unresolvedPath(dir)!, 'garbage');
    expect(cli('unresolved').status).toBe(3);
  });

  it('--gate blocks (2) while the cheat is present and clears (0) after an honest fix', () => {
    writeFileSync(join(dir, 'a.test.ts'), cheated);
    rec();
    expect(cli('unresolved', '--gate').status).toBe(2);
    writeFileSync(join(dir, 'a.test.ts'), seed);
    expect(cli('unresolved', '--gate').status).toBe(0);
    expect(readUnresolved(dir).state).toBe('none');
  });

  it('the pre-commit hook runs the gate before its own partial --staged check', () => {
    const hook = preCommitHookContent();
    expect(hook.indexOf('unresolved --gate')).toBeGreaterThan(-1);
    expect(hook.indexOf('unresolved --gate')).toBeLessThan(hook.indexOf('check --staged'));
  });

  it('Stop hook exhaustion records unresolved state in enforce mode but not advisory mode', () => {
    const hook = (extra: Record<string, string>, n: number) => spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'antigravity'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp, ...extra },
      input: JSON.stringify({ executionNum: n, conversationId: `c-${extra['PROCTOR_STOP_HOOK_MODE'] ?? 'enforce'}`, workspacePaths: [dir] }),
    });
    writeFileSync(join(dir, 'a.test.ts'), cheated);
    const advisory = { PROCTOR_STOP_HOOK_MODE: 'advisory', PROCTOR_STOP_HOOK_BLOCK_BUDGET: '2' };
    expect(JSON.parse(hook(advisory, 0).stdout).decision).toBe('block');
    expect(JSON.parse(hook(advisory, 1).stdout).decision).toBe('block');
    const spent = hook(advisory, 2);
    expect(spent.stdout).toBe('');
    expect(spent.stderr).toContain('advisory mode');
    expect(readUnresolved(dir).state).toBe('none');

    const enforce = { PROCTOR_STOP_HOOK_BLOCK_BUDGET: '1' };
    expect(JSON.parse(hook(enforce, 0).stdout).decision).toBe('block');
    const done = hook(enforce, 1);
    expect(done.stdout).toBe('');
    expect(done.stderr).toContain('UNRESOLVED');
    expect(done.stderr).toContain('not a tamper-proof gate');
    expect(readUnresolved(dir).state).toBe('unresolved');
  });
});

describe('stopHookPolicy', () => {
  it('defaults to enforce with the default budget; advisory is explicit opt-in', () => {
    expect(stopHookPolicy({})).toEqual({ mode: 'enforce', budget: ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS });
    expect(stopHookPolicy({ PROCTOR_STOP_HOOK_MODE: 'advisory' }).mode).toBe('advisory');
    expect(stopHookPolicy({ PROCTOR_STOP_HOOK_MODE: 'off' }).mode).toBe('enforce');
  });
  it.each(['0', '51', '-1', 'abc', '2.5', ''])('ignores invalid budget %s', v => {
    expect(stopHookPolicy({ PROCTOR_STOP_HOOK_BLOCK_BUDGET: v }).budget).toBe(ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS);
  });
  it('accepts 1-50', () => {
    expect(stopHookPolicy({ PROCTOR_STOP_HOOK_BLOCK_BUDGET: '12' }).budget).toBe(12);
  });
});
