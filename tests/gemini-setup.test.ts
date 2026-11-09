import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'dist/cli.js');
let dir: string;
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
const hooksPath = () => join(dir, '.gemini', 'settings.json');
const readHooks = () => JSON.parse(readFileSync(hooksPath(), 'utf8'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proctor-gemini-setup-'));
  const result = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('setup with Gemini targets', () => {
  it('installs Gemini enforcement for a detected .gemini project and explains hook fingerprints and one-time trust', () => {
    mkdirSync(join(dir, '.gemini'));
    const result = run('setup');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Detected 1 agent in this repo: gemini-cli');
    expect(result.stdout).toContain('Gemini AfterAgent hook installed:');
    expect(result.stdout).toContain('fingerprints project hooks');
    expect(result.stdout).toContain('new or changed hooks');
    expect(result.stdout).toContain('one-time trust');
    expect(result.stdout).toContain('/hooks');
    expect(existsSync(join(dir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(existsSync(join(dir, 'GEMINI.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude'))).toBe(false);
    expect(readHooks()).toEqual({ hooks: { AfterAgent: [{ matcher: '*', hooks: [{
      name: 'proctor', type: 'command', command: 'npx @kavishdua/proctor stop-hook --format gemini', timeout: 60_000,
      description: 'Block AI test tampering before the turn ends',
    }] }] } });
  });

  it('installs Gemini hooks for an explicit target without existing Gemini config', () => {
    expect(run('setup', '--agents', 'gemini-cli').status).toBe(0);
    expect(readHooks().hooks.AfterAgent).toHaveLength(1);
  });

  it('installs Gemini hooks when only GEMINI.md is detected', () => {
    writeFileSync(join(dir, 'GEMINI.md'), 'My project instructions\n');
    expect(run('setup').status).toBe(0);
    expect(readHooks().hooks.AfterAgent).toHaveLength(1);
    expect(readFileSync(join(dir, 'GEMINI.md'), 'utf8')).toContain('My project instructions');
  });

  it('installs independent hooks for mixed Codex and Gemini targets', () => {
    expect(run('setup', '--agents', 'codex,gemini-cli').status).toBe(0);
    expect(readHooks().hooks.AfterAgent).toHaveLength(1);
    const codex = JSON.parse(readFileSync(join(dir, '.codex', 'hooks.json'), 'utf8'));
    expect(codex.hooks.Stop).toHaveLength(1);
    expect(codex.hooks.Stop[0].hooks[0].command).toContain('--format codex');
  });

  it('installs Gemini hooks under --all', () => {
    expect(run('setup', '--all').status).toBe(0);
    expect(readHooks().hooks.AfterAgent).toHaveLength(1);
    expect(existsSync(join(dir, '.claude', 'settings.json'))).toBe(true);
  });

  it('does not write Gemini config when Gemini is not a resolved target', () => {
    expect(run('setup', '--agents', 'cursor').status).toBe(0);
    expect(existsSync(join(dir, '.gemini'))).toBe(false);
  });

  it('merges unrelated hooks and is idempotent', () => {
    mkdirSync(join(dir, '.gemini'));
    const existing = { description: 'keep', hooks: { AfterAgent: [{ hooks: [{ command: 'echo other' }] }] } };
    writeFileSync(hooksPath(), JSON.stringify(existing));
    expect(run('setup').status).toBe(0);
    const before = readFileSync(hooksPath(), 'utf8');
    const result = run('setup');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Gemini AfterAgent hook already installed');
    expect(result.stdout).toContain('/hooks');
    expect(readFileSync(hooksPath(), 'utf8')).toBe(before);
    expect(readHooks().description).toBe('keep');
    expect(readHooks().hooks.AfterAgent).toHaveLength(2);
    expect(readHooks().hooks.AfterAgent[0]).toEqual(existing.hooks.AfterAgent[0]);
  });

  it('reports invalid JSON, preserves it, and completes the ruleset and git hook', () => {
    mkdirSync(join(dir, '.gemini'));
    writeFileSync(hooksPath(), '{not json');
    const result = run('setup');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Gemini AfterAgent hook was not installed');
    expect(result.stdout).toContain('Setup incomplete');
    expect(readFileSync(hooksPath(), 'utf8')).toBe('{not json');
    expect(existsSync(join(dir, 'GEMINI.md'))).toBe(true);
    expect(existsSync(join(dir, '.git', 'hooks', 'pre-commit'))).toBe(true);
  });

  it('reports an unwritable hooks path without claiming setup succeeded', () => {
    mkdirSync(hooksPath(), { recursive: true });
    const result = run('setup');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not install the Gemini AfterAgent hook');
    expect(result.stdout).toContain('Setup incomplete');
  });

  it('uninstalls only the Gemini command and supports dry-run', () => {
    expect(run('setup', '--agents', 'gemini-cli').status).toBe(0);
    const settings = readHooks();
    const other = { type: 'command', command: 'echo other' };
    settings.hooks.AfterAgent[0].hooks.push(other);
    settings.description = 'keep';
    writeFileSync(hooksPath(), JSON.stringify(settings));
    const before = readFileSync(hooksPath(), 'utf8');
    expect(run('uninstall', '--dry-run').stdout).toContain('.gemini/settings.json');
    expect(readFileSync(hooksPath(), 'utf8')).toBe(before);
    const result = run('uninstall');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('.gemini/settings.json');
    expect(readHooks()).toEqual({ description: 'keep', hooks: { AfterAgent: [{ matcher: '*', hooks: [other] }] } });
  });
});
