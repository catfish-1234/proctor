import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installCodexStopHook, removeCodexStopHook } from '../src/hooks/codex-hooks.js';

let dir: string;
const path = (): string => join(dir, 'hooks.json');
const read = (): Promise<string> => readFile(path(), 'utf8');
const write = (raw: string): Promise<void> => writeFile(path(), raw, 'utf8');
const proctorHook = { type: 'command', command: 'npx @kavishdua/proctor stop-hook --format codex', timeout: 60 };

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'proctor-codex-hooks-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('installCodexStopHook', () => {
  it('creates a missing directory and the documented Stop config, without a matcher', async () => {
    const missingDir = join(dir, '.codex');
    const result = await installCodexStopHook(missingDir);
    const hooksPath = join(missingDir, 'hooks.json');
    expect(result).toEqual({ status: 'installed', path: hooksPath });
    expect(JSON.parse(await readFile(hooksPath, 'utf8'))).toEqual({ hooks: { Stop: [{ hooks: [proctorHook] }] } });
  });

  it('preserves top-level fields, other events, Stop groups and commands', async () => {
    const existing = {
      description: 'my hooks', custom: { keep: true },
      hooks: { SessionStart: [{ hooks: [{ command: 'echo start' }] }], Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] },
    };
    await write(JSON.stringify(existing));
    expect((await installCodexStopHook(dir)).status).toBe('installed');
    expect(JSON.parse(await read())).toEqual({
      ...existing, hooks: { ...existing.hooks, Stop: [...existing.hooks.Stop, { hooks: [proctorHook] }] },
    });
  });

  it('does not change the file or append an entry on the second install', async () => {
    await installCodexStopHook(dir);
    const before = await read();
    expect((await installCodexStopHook(dir)).status).toBe('already');
    expect(await read()).toBe(before);
  });

  it('recognizes proctor inside an existing group with unrelated hooks', async () => {
    const raw = JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: 'echo other' }, proctorHook] }] } });
    await write(raw);
    expect((await installCodexStopHook(dir)).status).toBe('already');
    expect(await read()).toBe(raw);
  });

  it.each([
    '{ not json', 'null', '[]', '"text"', '{"hooks":null}', '{"hooks":[]}',
    '{"hooks":5}', '{"hooks":"x"}', '{"hooks":{"Stop":{}}}', '{"hooks":{"Stop":"x"}}',
  ])('reports invalid config without changing it: %s', async raw => {
    await write(raw);
    expect(await installCodexStopHook(dir)).toEqual({ status: 'invalid-json', path: path() });
    expect(await read()).toBe(raw);
  });

  it.each([null, 'text', 7, { hooks: 'x' }, { hooks: [null, { command: 5 }] }])
    ('preserves unusual Stop entries without throwing: %j', async group => {
      await write(JSON.stringify({ hooks: { Stop: [group] } }));
      expect((await installCodexStopHook(dir)).status).toBe('installed');
      expect(JSON.parse(await read()).hooks.Stop).toEqual([group, { hooks: [proctorHook] }]);
    });

  it('accepts a UTF-8 byte order mark', async () => {
    await write('\uFEFF{"description":"keep"}');
    expect((await installCodexStopHook(dir)).status).toBe('installed');
    expect(JSON.parse(await read()).description).toBe('keep');
  });

  it('reports an unreadable path rather than treating it as an absent file', async () => {
    await mkdir(path());
    await expect(installCodexStopHook(dir)).rejects.toThrow();
  });
});

describe('removeCodexStopHook', () => {
  it('preserves sibling commands, groups, events and top-level fields', async () => {
    const other = { type: 'command', command: 'echo other' };
    const existing = { description: 'keep', hooks: { SessionStart: [], Stop: [{ hooks: [other, proctorHook], custom: true }, null] } };
    await write(JSON.stringify(existing));
    expect(await removeCodexStopHook(dir, false)).toBe(path());
    expect(JSON.parse(await read())).toEqual({
      ...existing, hooks: { ...existing.hooks, Stop: [{ hooks: [other], custom: true }, null] },
    });
  });

  it('removes empty proctor groups and hooks objects', async () => {
    await installCodexStopHook(dir);
    await removeCodexStopHook(dir, false);
    expect(JSON.parse(await read())).toEqual({});
  });

  it('supports dry-run without writing', async () => {
    await installCodexStopHook(dir);
    const before = await read();
    expect(await removeCodexStopHook(dir, true)).toBe(path());
    expect(await read()).toBe(before);
  });

  it.each([undefined, '{not json', 'null', '{"hooks":{"Stop":"x"}}', '{"hooks":{"Stop":[null]}}', '{}'])
    ('safely skips missing, invalid or unrelated config: %s', async raw => {
      if (raw !== undefined) await write(raw);
      expect(await removeCodexStopHook(dir, false)).toBeUndefined();
      if (raw !== undefined) expect(await read()).toBe(raw);
    });
});
