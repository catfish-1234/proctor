import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installStopHook, removeStopHook } from '../src/hooks/claude-settings.js';

let dir: string;
const settingsPath = (): string => join(dir, 'settings.json');
const write = (value: string): Promise<void> => writeFile(settingsPath(), value, 'utf8');
const read = async (): Promise<string> => readFile(settingsPath(), 'utf8');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'proctor-settings-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('installStopHook', () => {
  it('creates a settings file when there is none', async () => {
    const result = await installStopHook(dir);
    expect(result.status).toBe('installed');
    const settings = JSON.parse(await read());
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  it('merges into existing settings without disturbing them', async () => {
    await write(JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ x: 1 }] } }));
    expect((await installStopHook(dir)).status).toBe('installed');
    const settings = JSON.parse(await read());
    expect(settings.model).toBe('opus');
    expect(settings.hooks.PreToolUse).toEqual([{ x: 1 }]);
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  it('is a no-op the second time', async () => {
    await installStopHook(dir);
    expect((await installStopHook(dir)).status).toBe('already');
    expect(JSON.parse(await read()).hooks.Stop).toHaveLength(1);
  });

  // Parseable is not the same as usable. Each of these would previously either throw a raw
  // TypeError mid-`setup`, or be silently dropped by JSON.stringify and reported as installed.
  it.each([
    ['a Stop that is an object, not an array', '{"hooks":{"Stop":{"matcher":"*"}}}'],
    ['a Stop that is a string', '{"hooks":{"Stop":"npx foo"}}'],
    ['a hooks that is a string', '{"hooks":"x"}'],
    ['a hooks that is a number', '{"hooks":5}'],
    ['a root that is null', 'null'],
    ['a root that is an array', '[1,2,3]'],
    ['a root that is a string', '"nope"'],
  ])('reports %s as invalid rather than throwing or lying', async (_label, content) => {
    await write(content);
    const result = await installStopHook(dir);
    expect(result.status).toBe('invalid-json');
    // The user's file is never touched when proctor cannot understand it.
    expect(await read()).toBe(content);
  });

  it('reports unparseable JSON as invalid and leaves the file alone', async () => {
    await write('{ not json');
    expect((await installStopHook(dir)).status).toBe('invalid-json');
    expect(await read()).toBe('{ not json');
  });

  // The Stop array is hand-editable, so its elements can be anything. Reaching into them without
  // checking threw a raw TypeError out of the middle of `setup`, after the ruleset and the
  // pre-commit hook had already been written.
  it.each([
    ['a null element', '{"hooks":{"Stop":[null]}}'],
    ['a string element', '{"hooks":{"Stop":["nope"]}}'],
    ['a number element', '{"hooks":{"Stop":[7]}}'],
    ['a group whose hooks is a string', '{"hooks":{"Stop":[{"hooks":"nope"}]}}'],
    ['a group whose hooks is a number', '{"hooks":{"Stop":[{"hooks":7}]}}'],
    ['a group whose hooks holds null', '{"hooks":{"Stop":[{"hooks":[null]}]}}'],
    ['a command that is not a string', '{"hooks":{"Stop":[{"hooks":[{"command":5}]}]}}'],
  ])('installs alongside %s instead of throwing', async (_label, content) => {
    await write(content);
    const result = await installStopHook(dir);
    expect(result.status).toBe('installed');
    // Whatever was there is still there, with proctor's entry appended.
    const stop = JSON.parse(await read()).hooks.Stop;
    expect(stop.length).toBe(2);
  });

  it('accepts a settings file written with a UTF-8 byte order mark', async () => {
    // PowerShell's `Out-File -Encoding utf8` writes one by default on Windows, and JSON.parse
    // rejects it, so this read as "not valid JSON" on a perfectly good file.
    await write('﻿{"model":"opus"}');
    expect((await installStopHook(dir)).status).toBe('installed');
    const settings = JSON.parse((await read()).replace(/^﻿/, ''));
    expect(settings.model).toBe('opus');
    expect(settings.hooks.Stop).toHaveLength(1);
  });
});

describe('removeStopHook', () => {
  it('removes only proctor’s entry and keeps the others', async () => {
    await write(JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } }));
    await installStopHook(dir);
    expect(await removeStopHook(dir, false)).toBe(settingsPath());
    const settings = JSON.parse(await read());
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe('echo other');
  });

  it('drops an empty hooks object rather than leaving noise behind', async () => {
    await installStopHook(dir);
    await removeStopHook(dir, false);
    expect(JSON.parse(await read()).hooks).toBeUndefined();
  });

  it('preserves unrelated top-level settings', async () => {
    await write(JSON.stringify({ model: 'opus', theme: 'dark' }));
    await installStopHook(dir);
    await removeStopHook(dir, false);
    const settings = JSON.parse(await read());
    expect(settings.model).toBe('opus');
    expect(settings.theme).toBe('dark');
  });

  it('--dry-run reports the path without writing', async () => {
    await installStopHook(dir);
    const before = await read();
    expect(await removeStopHook(dir, true)).toBe(settingsPath());
    expect(await read()).toBe(before);
  });

  it('returns undefined when there is nothing of proctor’s to remove', async () => {
    await write(JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: 'echo other' }] }] } }));
    expect(await removeStopHook(dir, false)).toBeUndefined();
  });

  it.each([
    ['a missing file', undefined],
    ['unparseable JSON', '{ not json'],
    ['a non-array Stop', '{"hooks":{"Stop":"x"}}'],
    ['a null root', 'null'],
  ])('returns undefined safely for %s', async (_label, content) => {
    if (content !== undefined) await write(content);
    expect(await removeStopHook(dir, false)).toBeUndefined();
  });
});
