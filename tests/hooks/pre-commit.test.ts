import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preCommitHookContent, installPreCommitHook, removePreCommitHook } from '../../src/hooks/pre-commit.js';

describe('preCommitHookContent', () => {
  const content = preCommitHookContent();

  it('is a shell script that runs proctor check --staged', () => {
    expect(content).toMatch(/^#!\/bin\/sh/);
    expect(content).toContain('check --staged');
  });

  it('is deterministic, identical output on repeated calls', () => {
    expect(preCommitHookContent()).toBe(preCommitHookContent());
  });

  it('prefers a local install over the network', () => {
    // A commit that depends on a registry round-trip is a commit that fails on a plane.
    const localIndex = content.indexOf('node_modules/.bin/proctor');
    const npxIndex = content.indexOf('npx');
    expect(localIndex).toBeGreaterThan(-1);
    expect(npxIndex).toBeGreaterThan(-1);
    expect(localIndex).toBeLessThan(npxIndex);
  });

  it('fails closed when proctor cannot run at all', () => {
    // The original hook ran `npx <pkg> check --staged` and mapped exit 1 to "allow", because 1 is
    // proctor's warning-only code. npx also exits 1 when it cannot resolve the package, so an
    // unreachable registry looked exactly like a clean run and the commit landed unchecked. The
    // probe is what separates the two.
    expect(content).toContain('--version');
    expect(content).toMatch(/if ! proctor_run --version/);
    expect(content).toMatch(/NOT checked/);
  });

  it('still lets warning-only findings through, and blocks on errors', () => {
    expect(content).toContain('if [ "$status" -eq 1 ]; then exit 0; fi');
    expect(content).toContain('exit $status');
  });

  it('tells the reader how to proceed rather than only refusing', () => {
    expect(content).toContain('--no-verify');
    expect(content).toMatch(/npm install/);
  });
});

describe('installPreCommitHook / removePreCommitHook in real repositories', () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const dirs: string[] = [];
  const tmp = () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), 'proctor-hook-')));
    dirs.push(d);
    return d;
  };
  const initRepo = () => {
    const d = tmp();
    git(d, 'init', '-q');
    git(d, 'config', 'user.email', 't@example.com');
    git(d, 'config', 'user.name', 't');
    writeFileSync(join(d, 'a.txt'), 'a');
    git(d, 'add', '.');
    git(d, 'commit', '-q', '-m', 'init');
    return d;
  };
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('installs into a plain clone at .git/hooks/pre-commit', async () => {
    const repo = initRepo();
    const hookPath = await installPreCommitHook(repo);
    expect(hookPath).toBe(join(repo, '.git', 'hooks', 'pre-commit'));
    expect(readFileSync(hookPath, 'utf8')).toBe(preCommitHookContent());
  });

  it('installs and removes in a linked worktree, where .git is a file', async () => {
    const repo = initRepo();
    const wt = join(tmp(), 'wt');
    git(repo, 'worktree', 'add', '-q', wt, '-b', 'feature');
    expect(statSync(join(wt, '.git')).isFile()).toBe(true);

    const hookPath = await installPreCommitHook(wt);
    expect(statSync(hookPath).isFile()).toBe(true);
    // The hook must sit where git looks for it, not under the worktree's .git file.
    expect(resolve(hookPath)).toBe(resolve(wt, git(wt, 'rev-parse', '--git-path', 'hooks').trim(), 'pre-commit'));

    expect(await removePreCommitHook(wt, true)).toBe(hookPath);
    expect(statSync(hookPath).isFile()).toBe(true); // dry run removes nothing
    expect(await removePreCommitHook(wt, false)).toBe(hookPath);
    expect(existsSync(hookPath)).toBe(false);
  });

  it('honors core.hooksPath', async () => {
    const repo = initRepo();
    git(repo, 'config', 'core.hooksPath', 'custom-hooks');
    const hookPath = await installPreCommitHook(repo);
    expect(hookPath).toBe(join(repo, 'custom-hooks', 'pre-commit'));
    expect(existsSync(join(repo, '.git', 'hooks', 'pre-commit'))).toBe(false);
    expect(await removePreCommitHook(repo, false)).toBe(hookPath);
  });

  it('backs up a foreign hook before replacing it, and never removes it on uninstall', async () => {
    const repo = initRepo();
    const hooks = join(repo, '.git', 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-commit'), '#!/bin/sh\necho mine\n');
    const hookPath = await installPreCommitHook(repo);
    expect(readFileSync(hookPath + '.bak', 'utf8')).toContain('echo mine');

    writeFileSync(hookPath, '#!/bin/sh\necho mine\n');
    expect(await removePreCommitHook(repo, false)).toBeUndefined();
    expect(existsSync(hookPath)).toBe(true);
  });

  it('refuses to install outside a git repository and creates nothing', async () => {
    const d = tmp();
    await expect(installPreCommitHook(d)).rejects.toThrow(/not a git repository/);
    expect(existsSync(join(d, '.git'))).toBe(false);
  });
});
