import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

// Project-local Codex lifecycle hooks: https://learn.chatgpt.com/docs/hooks.md
// Stop uses a JSON block decision on stdout, not Claude Code's exit-2 protocol.
const STOP_HOOK_COMMAND = `npx ${pkg.name} stop-hook --format codex`;

export interface InstallCodexStopHookResult {
  status: 'installed' | 'already' | 'invalid-json';
  path: string;
}

/** A hand-edited hooks file is user-owned: reject unusable shapes rather than replacing them. */
function parseHooks(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw.replace(/^﻿/, ''));
    if (!isPlainObject(parsed)) return undefined;
    const hooks = parsed['hooks'];
    if (hooks !== undefined && !isPlainObject(hooks)) return undefined;
    const stop = (hooks as Record<string, unknown> | undefined)?.['Stop'];
    if (stop !== undefined && !Array.isArray(stop)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Merge one Stop group into .codex/hooks.json, preserving other groups, events and fields. */
export async function installCodexStopHook(dir: string): Promise<InstallCodexStopHookResult> {
  const path = join(dir, 'hooks.json');
  let settings: Record<string, unknown> = {};
  let raw: string | undefined;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err: unknown) {
    // An unreadable file must never be mistaken for a missing one and overwritten.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (raw !== undefined) {
    const parsed = parseHooks(raw);
    if (!parsed) return { status: 'invalid-json', path };
    settings = parsed;
  }
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;
  const stop = (hooks['Stop'] ?? []) as unknown[];
  if (stop.some(group => isPlainObject(group) && Array.isArray(group['hooks']) && group['hooks'].some(isProctorHook))) {
    return { status: 'already', path };
  }
  // Stop has no matcher. Codex's timeout unit is seconds.
  stop.push({ hooks: [{ type: 'command', command: STOP_HOOK_COMMAND, timeout: 60 }] });
  hooks['Stop'] = stop;
  settings['hooks'] = hooks;
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { status: 'installed', path };
}

/** Remove only proctor's command, including from a group shared with unrelated commands. */
export async function removeCodexStopHook(dir: string, dryRun: boolean): Promise<string | undefined> {
  const path = join(dir, 'hooks.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  const settings = parseHooks(raw);
  if (!settings) return undefined;
  const hooks = settings['hooks'] as Record<string, unknown> | undefined;
  const stop = (hooks?.['Stop'] ?? []) as unknown[];
  let removed = false;
  const kept = stop.flatMap(group => {
    if (!isPlainObject(group) || !Array.isArray(group['hooks'])) return [group];
    const commands = group['hooks'].filter(h => !isProctorHook(h));
    if (commands.length === group['hooks'].length) return [group];
    removed = true;
    return commands.length > 0 ? [{ ...group, hooks: commands }] : [];
  });
  if (!removed || !hooks) return undefined;
  if (!dryRun) {
    if (kept.length > 0) hooks['Stop'] = kept;
    else delete hooks['Stop'];
    if (Object.keys(hooks).length === 0) delete settings['hooks'];
    await writeFile(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
  return path;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProctorHook(hook: unknown): boolean {
  return isPlainObject(hook) && hook['type'] === 'command' && hook['command'] === STOP_HOOK_COMMAND;
}
