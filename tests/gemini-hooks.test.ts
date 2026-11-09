import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installGeminiAfterAgentHook, removeGeminiAfterAgentHook } from '../src/hooks/gemini-hooks.js';

let dir: string;
const path = (): string => join(dir, 'settings.json');
const read = (): Promise<string> => readFile(path(), 'utf8');
const write = (raw: string): Promise<void> => writeFile(path(), raw, 'utf8');
const proctorHook = {
  name: 'proctor', type: 'command', command: 'npx @kavishdua/proctor stop-hook --format gemini', timeout: 60_000,
  description: 'Block AI test tampering before the turn ends',
};

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'proctor-gemini-hooks-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('installGeminiAfterAgentHook', () => {
  it('creates a missing directory and the documented AfterAgent config with a wildcard matcher', async () => {
    const missingDir = join(dir, '.gemini');
    const result = await installGeminiAfterAgentHook(missingDir);
    const hooksPath = join(missingDir, 'settings.json');
    expect(result).toEqual({ status: 'installed', path: hooksPath });
    expect(JSON.parse(await readFile(hooksPath, 'utf8'))).toEqual({ hooks: { AfterAgent: [{ matcher: '*', hooks: [proctorHook] }] } });
  });

  it('preserves top-level fields, other events, AfterAgent groups and commands', async () => {
    const existing = {
      description: 'my hooks', custom: { keep: true },
      hooks: { SessionStart: [{ hooks: [{ command: 'echo start' }] }], AfterAgent: [{ hooks: [{ type: 'command', command: 'echo other' }] }] },
    };
    await write(JSON.stringify(existing));
    expect((await installGeminiAfterAgentHook(dir)).status).toBe('installed');
    expect(JSON.parse(await read())).toEqual({
      ...existing, hooks: { ...existing.hooks, AfterAgent: [...existing.hooks.AfterAgent, { matcher: '*', hooks: [proctorHook] }] },
    });
  });

  it('does not change the file or append an entry on the second install', async () => {
    await installGeminiAfterAgentHook(dir);
    const before = await read();
    expect((await installGeminiAfterAgentHook(dir)).status).toBe('already');
    expect(await read()).toBe(before);
  });

  it('recognizes proctor inside an existing group with unrelated hooks', async () => {
    const raw = JSON.stringify({ hooks: { AfterAgent: [{ hooks: [{ command: 'echo other' }, proctorHook] }] } });
    await write(raw);
    expect((await installGeminiAfterAgentHook(dir)).status).toBe('already');
    expect(await read()).toBe(raw);
  });

  it.each([
    '{ not json', 'null', '[]', '"text"', '{"hooks":null}', '{"hooks":[]}',
    '{"hooks":5}', '{"hooks":"x"}', '{"hooks":{"AfterAgent":{}}}', '{"hooks":{"AfterAgent":"x"}}',
  ])('reports invalid config without changing it: %s', async raw => {
    await write(raw);
    expect(await installGeminiAfterAgentHook(dir)).toEqual({ status: 'invalid-json', path: path() });
    expect(await read()).toBe(raw);
  });

  it.each([null, 'text', 7, { hooks: 'x' }, { hooks: [null, { command: 5 }] }])
    ('preserves unusual AfterAgent entries without throwing: %j', async group => {
      await write(JSON.stringify({ hooks: { AfterAgent: [group] } }));
      expect((await installGeminiAfterAgentHook(dir)).status).toBe('installed');
      expect(JSON.parse(await read()).hooks.AfterAgent).toEqual([group, { matcher: '*', hooks: [proctorHook] }]);
    });

  it('accepts a UTF-8 byte order mark', async () => {
    await write('\uFEFF{"description":"keep"}');
    expect((await installGeminiAfterAgentHook(dir)).status).toBe('installed');
    expect(JSON.parse(await read()).description).toBe('keep');
  });

  it('reports an unreadable path rather than treating it as an absent file', async () => {
    await mkdir(path());
    await expect(installGeminiAfterAgentHook(dir)).rejects.toThrow();
  });
});

describe('removeGeminiAfterAgentHook', () => {
  it('preserves sibling commands, groups, events and top-level fields', async () => {
    const other = { type: 'command', command: 'echo other' };
    const existing = { description: 'keep', hooks: { SessionStart: [], AfterAgent: [{ hooks: [other, proctorHook], custom: true }, null] } };
    await write(JSON.stringify(existing));
    expect(await removeGeminiAfterAgentHook(dir, false)).toBe(path());
    expect(JSON.parse(await read())).toEqual({
      ...existing, hooks: { ...existing.hooks, AfterAgent: [{ hooks: [other], custom: true }, null] },
    });
  });

  it('removes empty proctor groups and hooks objects', async () => {
    await installGeminiAfterAgentHook(dir);
    await removeGeminiAfterAgentHook(dir, false);
    expect(JSON.parse(await read())).toEqual({});
  });

  it('supports dry-run without writing', async () => {
    await installGeminiAfterAgentHook(dir);
    const before = await read();
    expect(await removeGeminiAfterAgentHook(dir, true)).toBe(path());
    expect(await read()).toBe(before);
  });

  it.each([undefined, '{not json', 'null', '{"hooks":{"AfterAgent":"x"}}', '{"hooks":{"AfterAgent":[null]}}', '{}'])
    ('safely skips missing, invalid or unrelated config: %s', async raw => {
      if (raw !== undefined) await write(raw);
      expect(await removeGeminiAfterAgentHook(dir, false)).toBeUndefined();
      if (raw !== undefined) expect(await read()).toBe(raw);
    });
});
