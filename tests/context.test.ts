import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRepoContext } from '../src/context.js';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'proctor-ctx-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('buildRepoContext', () => {
  it('returns default globs when no config file exists', async () => {
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.testPathGlobs).toHaveLength(7);
    expect(ctx.testPathGlobs).toContain('**/*.test.ts');
    expect(ctx.enabled).toHaveLength(8);
    expect(ctx.enabled).toContain('RH001');
  });

  it('reads testPathGlobs from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ testPathGlobs: ['src/**/*.test.ts'] }),
    );
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.testPathGlobs).toEqual(['src/**/*.test.ts']);
  });

  it('reads enabled from proctor.config.json', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ enabled: ['RH001', 'RH002'] }),
    );
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.enabled).toEqual(['RH001', 'RH002']);
  });

  it('isTestFile returns true for paths matching default globs', async () => {
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.isTestFile('src/calculator.test.ts')).toBe(true);
    expect(ctx.isTestFile('src/calculator.ts')).toBe(false);
  });

  it('isTestFile normalizes Windows backslashes', async () => {
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.isTestFile('src\\calculator.test.ts')).toBe(true);
  });

  it('falls back to defaults when config JSON is malformed', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), '{ invalid json }');
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.testPathGlobs).toHaveLength(7);
  });

  it('testFiles resolved from globs relative to cwd', async () => {
    await mkdir(join(tmpDir, 'src'));
    await writeFile(join(tmpDir, 'src', 'foo.test.ts'), '// test');
    const ctx = await buildRepoContext(tmpDir);
    expect(ctx.testFiles.some((f) => f.endsWith('.test.ts'))).toBe(true);
  });
});
