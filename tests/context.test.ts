import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContext } from '../src/context/index.js';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'proctor-ctx-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('buildContext', () => {
  it('returns default globs when no config file exists', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toHaveLength(9);
    expect(ctx.testPathGlobs).toContain('**/*.test.ts');
    expect(ctx.testPathGlobs).toContain('**/test_*.py');
    expect(ctx.testPathGlobs).toContain('**/*_test.py');
    expect(ctx.enabled).toHaveLength(11);
    expect(ctx.enabled).toContain('RH001');
  });

  it('embeds the discovered diff files onto context.files', async () => {
    const files = [{ from: 'a.ts', to: 'a.ts' }] as unknown as Awaited<ReturnType<typeof buildContext>>['files'];
    const ctx = await buildContext(tmpDir, files);
    expect(ctx.files).toBe(files);
  });

  it('reads testPathGlobs from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ testPathGlobs: ['src/**/*.test.ts'] }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toEqual(['src/**/*.test.ts']);
  });

  it('reads enabled from proctor.config.json', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ enabled: ['RH001', 'RH002'] }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.enabled).toEqual(['RH001', 'RH002']);
  });

  it('isTestFile returns true for paths matching default globs', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.isTestFile('src/calculator.test.ts')).toBe(true);
    expect(ctx.isTestFile('src/calculator.ts')).toBe(false);
  });

  it('isTestFile normalizes Windows backslashes', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.isTestFile('src\\calculator.test.ts')).toBe(true);
  });

  it('falls back to defaults when config JSON is malformed', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), '{ invalid json }');
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toHaveLength(9);
  });

  it('testFiles resolved from globs relative to cwd', async () => {
    await mkdir(join(tmpDir, 'src'));
    await writeFile(join(tmpDir, 'src', 'foo.test.ts'), '// test');
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testFiles.some((f) => f.endsWith('.test.ts'))).toBe(true);
  });

  // commitMessage, snapshotGlobs, aiModel

  it('commitMessage is a non-empty string in a repo with commits', async () => {
    // Use the project's own cwd which has commits
    const ctx = await buildContext(PROJECT_ROOT, []);
    expect(ctx.commitMessage).toBeDefined();
    expect(typeof ctx.commitMessage).toBe('string');
    expect((ctx.commitMessage as string).length).toBeGreaterThan(0);
  });

  it('commitMessage is undefined in a fresh repo with no commits', async () => {
    // Initialize a fresh git repo with no commits
    spawnSync('git', ['init'], { cwd: tmpDir, encoding: 'utf8' });
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.commitMessage).toBeUndefined();
  });

  it('reads aiModel from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ aiModel: 'claude-opus-4-5' }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.aiModel).toBe('claude-opus-4-5');
  });

  it('snapshotGlobs is undefined when no config file exists', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.snapshotGlobs).toBeUndefined();
  });

  it('reads snapshotGlobs from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ snapshotGlobs: ['**/__snapshots__/*.snap'] }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.snapshotGlobs).toEqual(['**/__snapshots__/*.snap']);
  });

  it('configRef reads the committed config, ignoring an uncommitted working-tree override', async () => {
    const git = (...args: string[]) => spawnSync('git', args, { cwd: tmpDir, encoding: 'utf8' });
    git('init');
    git('config', 'user.email', 'x@x');
    git('config', 'user.name', 'x');
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: ['RH001'] }));
    git('add', '.');
    git('commit', '-m', 'add config');
    // The working tree now tries to disable everything; committed config must win.
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: [] }));
    const ctx = await buildContext(tmpDir, [], { configRef: 'HEAD' });
    expect(ctx.enabled).toEqual(['RH001']);
  });

  it('configRef falls back to defaults when no config exists at the ref, even if one exists uncommitted', async () => {
    const git = (...args: string[]) => spawnSync('git', args, { cwd: tmpDir, encoding: 'utf8' });
    git('init');
    git('config', 'user.email', 'x@x');
    git('config', 'user.name', 'x');
    git('commit', '--allow-empty', '-m', 'init');
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: [] }));
    const ctx = await buildContext(tmpDir, [], { configRef: 'HEAD' });
    expect(ctx.enabled).toHaveLength(11);
  });
});
