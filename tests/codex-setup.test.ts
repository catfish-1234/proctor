import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'dist/cli.js');
let dir: string;
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
const hooksPath = () => join(dir, '.codex', 'hooks.json');
const readHooks = () => JSON.parse(readFileSync(hooksPath(), 'utf8'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proctor-codex-setup-'));
  const result = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('setup with Codex targets', () => {
  it('installs Codex enforcement for a detected .codex project and explains both trust steps', () => {
    mkdirSync(join(dir, '.codex'));
    const result = run('setup');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Detected 1 agent in this repo: codex');
    expect(result.stdout).toContain('Codex Stop hook installed:');
    expect(result.stdout).toContain('project trust');
    expect(result.stdout).toContain('hook review');
    expect(result.stdout).toContain('/hooks');
    expect(existsSync(join(dir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(existsSync(join(dir, '.agents', 'skills', 'proctor', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude'))).toBe(false);
    expect(readHooks()).toEqual({ hooks: { Stop: [{ hooks: [{
      type: 'command', command: 'npx @kavishdua/proctor stop-hook --format codex', timeout: 60,
    }] }] } });
  });

  it('installs Codex hooks for an explicit target without existing Codex config', () => {
    expect(run('setup', '--agents', 'codex').status).toBe(0);
    expect(readHooks().hooks.Stop).toHaveLength(1);
  });

  it('installs Codex hooks under --all', () => {
    expect(run('setup', '--all').status).toBe(0);
    expect(readHooks().hooks.Stop).toHaveLength(1);
    expect(existsSync(join(dir, '.claude', 'settings.json'))).toBe(true);
  });

  it('does not write Codex config when Codex is not a resolved target', () => {
    expect(run('setup', '--agents', 'cursor').status).toBe(0);
    expect(existsSync(join(dir, '.codex'))).toBe(false);
  });

  it('merges unrelated hooks and is idempotent', () => {
    mkdirSync(join(dir, '.codex'));
    const existing = { description: 'keep', hooks: { Stop: [{ hooks: [{ command: 'echo other' }] }] } };
    writeFileSync(hooksPath(), JSON.stringify(existing));
    expect(run('setup').status).toBe(0);
    const before = readFileSync(hooksPath(), 'utf8');
    const result = run('setup');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Codex Stop hook already installed');
    expect(result.stdout).toContain('/hooks');
    expect(readFileSync(hooksPath(), 'utf8')).toBe(before);
    expect(readHooks().description).toBe('keep');
    expect(readHooks().hooks.Stop).toHaveLength(2);
    expect(readHooks().hooks.Stop[0]).toEqual(existing.hooks.Stop[0]);
  });

  it('reports invalid JSON, preserves it, and completes the ruleset and git hook', () => {
    mkdirSync(join(dir, '.codex'));
    writeFileSync(hooksPath(), '{not json');
    const result = run('setup');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Codex Stop hook was not installed');
    expect(result.stdout).toContain('Setup incomplete');
    expect(readFileSync(hooksPath(), 'utf8')).toBe('{not json');
    expect(existsSync(join(dir, '.agents', 'skills', 'proctor', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.git', 'hooks', 'pre-commit'))).toBe(true);
  });

  it('reports an unwritable hooks path without claiming setup succeeded', () => {
    mkdirSync(hooksPath(), { recursive: true });
    const result = run('setup');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not install the Codex Stop hook');
    expect(result.stdout).toContain('Setup incomplete');
  });

  it('uninstalls only the Codex command and supports dry-run', () => {
    expect(run('setup', '--agents', 'codex').status).toBe(0);
    const settings = readHooks();
    const other = { type: 'command', command: 'echo other' };
    settings.hooks.Stop[0].hooks.push(other);
    settings.description = 'keep';
    writeFileSync(hooksPath(), JSON.stringify(settings));
    const before = readFileSync(hooksPath(), 'utf8');
    expect(run('uninstall', '--dry-run').stdout).toContain('.codex/hooks.json');
    expect(readFileSync(hooksPath(), 'utf8')).toBe(before);
    const result = run('uninstall');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('.codex/hooks.json');
    expect(readHooks()).toEqual({ description: 'keep', hooks: { Stop: [{ hooks: [other] }] } });
  });
});
