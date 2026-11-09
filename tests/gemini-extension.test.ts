import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const extensionHooks = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
const hook = extensionHooks.hooks.AfterAgent[0].hooks[0];
const payload = JSON.stringify({ prompt: 'Fix the bug', prompt_response: 'Done', stop_hook_active: false });

describe('Gemini extension AfterAgent bundle', () => {
  let dir: string;
  let extensionPath: string;
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  const runHook = () => spawnSync(hook.command.replaceAll('${extensionPath}', extensionPath), {
    cwd: dir, input: payload, encoding: 'utf8', shell: true,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'proctor-gemini-extension-'));
    // Simulate an extension checkout without node_modules or a global proctor executable.
    extensionPath = join(dir, 'extension with spaces');
    mkdirSync(join(extensionPath, 'dist'), { recursive: true });
    copyFileSync(join(ROOT, 'package.json'), join(extensionPath, 'package.json'));
    copyFileSync(resolve(ROOT, 'dist/cli.js'), join(extensionPath, 'dist/cli.js'));
    git('init');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'a.test.ts'), "it('a', () => { expect(1).toBe(1); });\nit('b', () => { expect(2).toBe(2); });\n");
    git('add', '.');
    git('commit', '-m', 'seed');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('uses the documented hooks/hooks.json layout and preserves the context manifest', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'gemini-extension.json'), 'utf8'));
    expect(manifest.contextFileName).toBe('PROCTOR.md');
    expect(manifest).not.toHaveProperty('hooks');
    expect(extensionHooks).toEqual({ hooks: { AfterAgent: [{ matcher: '*', hooks: [{
      name: 'proctor', type: 'command', command: 'node "${extensionPath}/dist/cli.js" stop-hook --format gemini',
      timeout: 60_000, description: 'Block AI test tampering before the turn ends',
    }] }] } });
  });

  it('executes the bundled hook silently for a clean working tree', () => {
    const result = runHook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('executes the bundled hook with deny feedback for a deleted test', () => {
    writeFileSync(join(dir, 'a.test.ts'), "it('a', () => { expect(1).toBe(1); });\n");
    const result = runHook();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ decision: 'deny', reason: expect.stringContaining('RH001') });
  });
});
