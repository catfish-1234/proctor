import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { budgetPath, decideBlockBudget, writeBudget } from '../../src/hooks/stop-hook.js';
import { recordUnresolved } from '../../src/hooks/unresolved.js';

const CLI = resolve('dist/cli.js');
const seed = "it('a', () => { expect(1).toBe(1); });\nit('b', () => { expect(2).toBe(2); });\n";
// Inject only local filesystem/subprocess faults. No adapter, network, model or judge calls.
const preload = String.raw`
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const {syncBuiltinESMExports} = require('node:module');
const spawn = cp.spawnSync, rename = fs.renameSync, write = fs.writeFileSync, open = fs.openSync;
const owned = new Set();
cp.spawnSync = function(command, args, options) {
  if (process.env.PROCTOR_TEST_FAULT === 'check' && command === process.execPath && args?.[1] === 'check')
    return {status:3, stdout:'SECRET_SENTINEL', stderr:'SECRET_SENTINEL', signal:null, pid:0};
  return spawn.apply(this, arguments);
};
fs.openSync = function(file, flags) {
  const fd = open.apply(this, arguments);
  if (String(file).endsWith('.tmp')) owned.add(fd);
  return fd;
};
fs.writeFileSync = function(file) {
  const result = write.apply(this, arguments);
  if (process.env.PROCTOR_TEST_FAULT === 'partial' && owned.has(file))
    throw Object.assign(new Error('SECRET_SENTINEL'), {code:'ENOSPC'});
  return result;
};
fs.renameSync = function(src, dest) {
  const fault = process.env.PROCTOR_TEST_FAULT;
  const budget = path.basename(path.dirname(String(dest))) === 'proctor-stop-hook';
  const record = path.basename(String(dest)) === 'unresolved.json';
  if ((fault === 'budget' && budget) || (fault === 'record' && record) || (fault === 'both' && (budget || record)))
    throw Object.assign(new Error('SECRET_SENTINEL'), {code:'EBUSY'});
  return rename.apply(this, arguments);
};
syncBuiltinESMExports();
`;

describe('Stop state integrity under deterministic faults', () => {
  let root: string, dir: string, temp: string, faultFile: string;
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
  };
  const budgetFile = () => join(temp, 'proctor-stop-hook', 'integrity.json');
  const recordFile = () => join(dir, '.git', 'proctor', 'unresolved.json');
  const bytes = (file: string) => readFileSync(file, 'utf8');
  const cheat = () => writeFileSync(join(dir, 'a.test.ts'), seed.split('\n')[0] + '\n');
  const hook = (executionNum: number | undefined, fault = '', format = 'antigravity', extra = {}) => spawnSync(process.execPath,
    ['--require', faultFile, CLI, 'stop-hook', '--format', format], {
      cwd: dir, encoding: 'utf8', input: JSON.stringify({ cwd: dir, workspacePaths: [dir], conversationId: 'integrity', executionNum }),
      env: { ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp, PROCTOR_TEST_FAULT: fault, PROCTOR_STOP_HOOK_MODE: 'enforce', PROCTOR_STOP_HOOK_BLOCK_BUDGET: '2', ...extra },
    });
  const unverified = (r: ReturnType<typeof hook>, status = 0) => {
    expect(r.status).toBe(status);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('UNVERIFIED');
    expect(r.stderr).not.toContain('SECRET_SENTINEL');
    expect(r.stderr.length).toBeLessThan(400);
  };
  const noTemporary = () => {
    for (const folder of [join(temp, 'proctor-stop-hook'), join(dir, '.git', 'proctor')])
      if (existsSync(folder)) expect(readdirSync(folder).filter(f => f.endsWith('.tmp'))).toEqual([]);
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proctor-state-'));
    dir = join(root, 'repo'); temp = join(root, 'temp'); mkdirSync(dir); mkdirSync(temp);
    faultFile = join(root, 'fault.cjs'); writeFileSync(faultFile, preload);
    git('init'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'a.test.ts'), seed); git('add', '.'); git('commit', '-m', 'seed');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it.each(['claude', 'codex', 'gemini', 'antigravity'])('separates nonblocking %s infrastructure diagnostics from stdout', format => {
    cheat(); unverified(hook(0, 'check', format), format === 'codex' || format === 'gemini' ? 1 : 0);
  });
  it('retains a proven count through a failed check and reaches the actual cap', () => {
    cheat(); expect(JSON.parse(hook(0).stdout).decision).toBe('block');
    const prior = bytes(budgetFile()); unverified(hook(1, 'check')); expect(bytes(budgetFile())).toBe(prior);
    expect(JSON.parse(hook(2).stdout).decision).toBe('block');
    expect(hook(3).stderr).toContain('budget exhausted');
    expect(JSON.parse(bytes(recordFile())).occurrences).toBe(1);
  });
  it('does not reset a known count when the optional sequence is omitted', () => {
    cheat(); hook(0);
    // JSON omission, not an explicit zero; helper defaults are intentionally bypassed here.
    const r = hook(undefined); expect(JSON.parse(r.stdout).decision).toBe('block');
    expect(JSON.parse(bytes(budgetFile())).blocks).toBe(2);
    expect(hook(undefined).stderr).toContain('budget exhausted');
    expect(decideBlockBudget({ blocks: 2 }, undefined, 2).exhausted).toBe(true);
  });
  it.each([1, undefined])('records a finding without invented exhaustion when state and a fresh sequence are absent (%s)', n => {
    cheat(); unverified(hook(n)); expect(existsSync(budgetFile())).toBe(false);
    const record = JSON.parse(bytes(recordFile())); expect(record.source).toBe('antigravity-budget-unverified');
    expect(record.originalFindings).toContain('no exhaustion or count is asserted');
    expect(record.originalFindings).toContain('RH001');
  });
  it('does not silently discard malformed budget bytes even on sequence zero', () => {
    cheat(); mkdirSync(join(temp, 'proctor-stop-hook')); writeFileSync(budgetFile(), '{broken original');
    unverified(hook(0)); expect(bytes(budgetFile())).toBe('{broken original'); expect(existsSync(recordFile())).toBe(true);
  });
  it('handles a budget path that is a directory without unbounded blocking', () => {
    cheat(); mkdirSync(budgetFile(), { recursive: true });
    unverified(hook(0)); unverified(hook(1)); expect(existsSync(recordFile())).toBe(true); noTemporary();
  });
  it.each(['budget', 'partial'])('preserves prior budget bytes and cleans owned artifacts after %s failure', fault => {
    cheat(); hook(0); const prior = bytes(budgetFile());
    unverified(hook(1, fault)); expect(bytes(budgetFile())).toBe(prior); noTemporary();
  });
  it('does not claim a clean-state reset when its atomic replacement failed', () => {
    cheat(); hook(0); const prior = bytes(budgetFile()); writeFileSync(join(dir, 'a.test.ts'), seed);
    unverified(hook(1, 'budget')); expect(bytes(budgetFile())).toBe(prior);
    expect(hook(2)).toMatchObject({ status: 0, stdout: '', stderr: '' });
    expect(JSON.parse(bytes(budgetFile())).blocks).toBe(0);
  });
  it('reports persistent record rename failure and cleans only its owned temporary', () => {
    cheat(); hook(0); hook(1); const dirPath = join(dir, '.git', 'proctor'); mkdirSync(dirPath, { recursive: true });
    const foreign = join(dirPath, 'unresolved.json.foreign.tmp'); writeFileSync(foreign, 'keep');
    unverified(hook(2, 'record')); expect(existsSync(recordFile())).toBe(false);
    expect(readdirSync(dirPath)).toEqual(['unresolved.json.foreign.tmp']); expect(bytes(foreign)).toBe('keep');
  });
  it('does not replace existing provenance/history after a failed record update', () => {
    cheat(); hook(0); hook(1); hook(2); const prior = bytes(recordFile());
    unverified(hook(3, 'record')); expect(bytes(recordFile())).toBe(prior); noTemporary();
    unverified(hook(4, 'budget')); const updated = JSON.parse(bytes(recordFile())), original = JSON.parse(prior);
    expect(updated.originalFindings).toBe(original.originalFindings); expect(updated.firstSeenAt).toBe(original.firstSeenAt);
    expect(updated.baseHead).toBe(original.baseHead); expect(updated.source).toBe(original.source);
  });
  it('makes simultaneous budget and finding persistence failure visible without a gate claim', () => {
    cheat(); unverified(hook(0, 'both')); expect(existsSync(recordFile())).toBe(false); noTemporary();
  });
  it('respects explicit advisory no-record policy when budget verification fails', () => {
    cheat(); const r = hook(1, '', 'antigravity', { PROCTOR_STOP_HOOK_MODE: 'advisory' });
    unverified(r); expect(r.stderr).toContain('advisory mode records nothing'); expect(existsSync(recordFile())).toBe(false);
  });
  it('leaves a pre-existing record temporary untouched rather than overwriting or deleting it', () => {
    const folder = join(dir, '.git', 'proctor'); mkdirSync(folder, { recursive: true });
    const foreign = recordFile() + `.${process.pid}.tmp`; writeFileSync(foreign, 'foreign bytes');
    expect(recordUnresolved({ cwd: dir, source: 'test', findings: 'finding', blockBudget: 2 })).toBeUndefined();
    expect(bytes(foreign)).toBe('foreign bytes'); expect(existsSync(recordFile())).toBe(false);
  });
  it('leaves a pre-existing budget temporary untouched', () => {
    const id = 'integrity-' + root.split(/[\\/]/).pop();
    const file = budgetPath(id), foreign = file + `.${process.pid}.tmp`;
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, '{"blocks":2}'); writeFileSync(foreign, 'foreign bytes');
    try {
      expect(writeBudget(id, { blocks: 3 })).toBe(false);
      expect(bytes(file)).toBe('{"blocks":2}'); expect(bytes(foreign)).toBe('foreign bytes');
    } finally { rmSync(file, { force: true }); rmSync(foreign, { force: true }); }
  });
  it('intentional mid-merge skip preserves the prior budget without claiming a check', () => {
    cheat(); hook(0); const prior = bytes(budgetFile()); writeFileSync(join(dir, '.git', 'MERGE_HEAD'), 'a'.repeat(40));
    expect(hook(1)).toMatchObject({ status: 0, stdout: '', stderr: '' }); expect(bytes(budgetFile())).toBe(prior);
  });
});
