import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installCopilotStopHook, removeCopilotStopHook } from '../src/hooks/copilot-hooks.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');
let dir: string;
const hooksDir = () => join(dir, '.github', 'hooks');
const hooksPath = () => join(hooksDir(), 'proctor.json');
const readHooks = () => JSON.parse(readFileSync(hooksPath(), 'utf8'));
const COMMAND = 'npx @kavishdua/proctor stop-hook --format copilot';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proctor-copilot-install-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('installCopilotStopHook', () => {
  it('writes exactly the documented repository hook contract (version 1, agentStop command entry)', async () => {
    const result = await installCopilotStopHook(hooksDir());
    expect(result.status).toBe('installed');
    expect(result.path).toBe(hooksPath());
    // Schema asserted field by field against docs.github.com/en/copilot/reference/hooks-reference:
    // bash for the cloud agent's Linux sandbox, command as the documented cross-platform
    // fallback, powershell for the CLI on Windows, timeoutSec above proctor's 60s internal cap.
    expect(readHooks()).toEqual({
      version: 1,
      hooks: {
        agentStop: [{
          type: 'command', command: COMMAND, bash: COMMAND, powershell: COMMAND, timeoutSec: 90,
        }],
      },
    });
  });

  it('is idempotent', async () => {
    await installCopilotStopHook(hooksDir());
    const before = readFileSync(hooksPath(), 'utf8');
    const result = await installCopilotStopHook(hooksDir());
    expect(result.status).toBe('already');
    expect(readFileSync(hooksPath(), 'utf8')).toBe(before);
  });

  it('merges into an existing proctor.json, preserving foreign events, entries and fields', async () => {
    mkdirSync(hooksDir(), { recursive: true });
    const existing = {
      version: 1,
      customField: 'keep',
      hooks: {
        agentStop: [{ type: 'command', command: 'echo other-stop' }],
        sessionStart: [{ type: 'command', bash: 'echo start' }],
      },
    };
    writeFileSync(hooksPath(), JSON.stringify(existing));
    const result = await installCopilotStopHook(hooksDir());
    expect(result.status).toBe('installed');
    const merged = readHooks();
    expect(merged.customField).toBe('keep');
    expect(merged.hooks.sessionStart).toEqual(existing.hooks.sessionStart);
    expect(merged.hooks.agentStop).toHaveLength(2);
    expect(merged.hooks.agentStop[0]).toEqual(existing.hooks.agentStop[0]);
  });

  it('never touches other hook files in the directory', async () => {
    mkdirSync(hooksDir(), { recursive: true });
    writeFileSync(join(hooksDir(), 'mine.json'), JSON.stringify({ version: 1, hooks: { agentStop: [{ type: 'command', bash: 'echo mine' }] } }));
    await installCopilotStopHook(hooksDir());
    expect(JSON.parse(readFileSync(join(hooksDir(), 'mine.json'), 'utf8')).hooks.agentStop[0].bash).toBe('echo mine');
  });

  it.each([
    ['not json', 'not-json'],
    ['valid JSON with a bad version', JSON.stringify({ version: 2, hooks: {} })],
    ['valid JSON with a non-array agentStop', JSON.stringify({ version: 1, hooks: { agentStop: {} } })],
    ['valid JSON with a non-object hooks', JSON.stringify({ version: 1, hooks: [] })],
  ])('reports %s and leaves the file untouched', async (_label, content) => {
    mkdirSync(hooksDir(), { recursive: true });
    writeFileSync(hooksPath(), content);
    const result = await installCopilotStopHook(hooksDir());
    expect(result.status).toBe('invalid-json');
    expect(readFileSync(hooksPath(), 'utf8')).toBe(content);
  });
});

describe('removeCopilotStopHook', () => {
  it('removes only proctor entries and drops emptied keys, preserving foreign content', async () => {
    mkdirSync(hooksDir(), { recursive: true });
    writeFileSync(hooksPath(), JSON.stringify({
      version: 1,
      hooks: {
        agentStop: [{ type: 'command', command: 'echo other' }, { type: 'command', command: COMMAND, bash: COMMAND, powershell: COMMAND, timeoutSec: 90 }],
        sessionStart: [{ type: 'command', bash: 'echo start' }],
      },
    }));
    expect(await removeCopilotStopHook(hooksDir(), false)).toBe(hooksPath());
    const after = readHooks();
    expect(after.hooks.agentStop).toEqual([{ type: 'command', command: 'echo other' }]);
    expect(after.hooks.sessionStart).toEqual([{ type: 'command', bash: 'echo start' }]);
  });

  it('drops the agentStop and hooks keys when only proctor entries remain, keeping the file', async () => {
    await installCopilotStopHook(hooksDir());
    expect(await removeCopilotStopHook(hooksDir(), false)).toBe(hooksPath());
    expect(readHooks()).toEqual({ version: 1 });
  });

  it('dry-run reports without writing', async () => {
    await installCopilotStopHook(hooksDir());
    const before = readFileSync(hooksPath(), 'utf8');
    expect(await removeCopilotStopHook(hooksDir(), true)).toBe(hooksPath());
    expect(readFileSync(hooksPath(), 'utf8')).toBe(before);
  });

  it('leaves a foreign-only or unreadable file alone', async () => {
    mkdirSync(hooksDir(), { recursive: true });
    writeFileSync(hooksPath(), JSON.stringify({ version: 1, hooks: { agentStop: [{ type: 'command', bash: 'echo mine' }] } }));
    expect(await removeCopilotStopHook(hooksDir(), false)).toBeUndefined();
    writeFileSync(hooksPath(), 'not-json');
    expect(await removeCopilotStopHook(hooksDir(), false)).toBeUndefined();
    expect(readFileSync(hooksPath(), 'utf8')).toBe('not-json');
  });
});

describe('setup with GitHub Copilot targets', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });

  beforeEach(() => {
    const result = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  });

  it('does NOT install the experimental hook on detection alone; the ruleset still deploys', () => {
    mkdirSync(join(dir, '.github', 'instructions'), { recursive: true });
    const result = run('setup');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('GitHub Copilot enforcement hook NOT installed');
    expect(result.stdout).toContain('opt-in');
    expect(existsSync(hooksPath())).toBe(false);
    expect(existsSync(join(dir, '.github', 'instructions', 'proctor.instructions.md'))).toBe(true);
  });

  it('installs the hook on explicit opt-in via --agents github-copilot and labels it experimental', () => {
    const result = run('setup', '--agents', 'github-copilot');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('experimental');
    expect(result.stdout).toContain('Copilot agentStop hook installed:');
    expect(result.stdout).toContain('not been live-verified');
    expect(readHooks().hooks.agentStop).toHaveLength(1);
  });

  it('installs the hook under --all', () => {
    const result = run('setup', '--all');
    expect(result.status).toBe(0);
    expect(readHooks().hooks.agentStop).toHaveLength(1);
  });

  it('setup --agents without github-copilot writes no Copilot hook', () => {
    expect(run('setup', '--agents', 'cursor').status).toBe(0);
    expect(existsSync(join(dir, '.github', 'hooks'))).toBe(false);
  });

  it('proctor uninstall removes the hook file content but no foreign entries', () => {
    run('setup', '--agents', 'github-copilot');
    expect(existsSync(hooksPath())).toBe(true);
    const result = run('uninstall');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Copilot agentStop hook');
    expect(readHooks()).toEqual({ version: 1 });
  });
});

describe('install-copilot-hook command', () => {
  it('installs and reports; a second run reports already', () => {
    const first = spawnSync(process.execPath, [CLI, 'install-copilot-hook'], { cwd: dir, encoding: 'utf8' });
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Installed:');
    const second = spawnSync(process.execPath, [CLI, 'install-copilot-hook'], { cwd: dir, encoding: 'utf8' });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Already installed');
  });

  it('exits 2 on an unparseable existing file without overwriting it', () => {
    mkdirSync(hooksDir(), { recursive: true });
    writeFileSync(hooksPath(), 'not-json');
    const result = spawnSync(process.execPath, [CLI, 'install-copilot-hook'], { cwd: dir, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not valid JSON');
    expect(readFileSync(hooksPath(), 'utf8')).toBe('not-json');
  });
});
