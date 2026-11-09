import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

// Project-local Gemini CLI hooks: https://geminicli.com/docs/hooks/reference/
// AfterAgent uses an exit-0 JSON deny decision with feedback to request a correction.
const AFTER_AGENT_HOOK_COMMAND = `npx ${pkg.name} stop-hook --format gemini`;

export interface InstallGeminiAfterAgentHookResult {
  status: 'installed' | 'already' | 'invalid-json';
  path: string;
}

/** A hand-edited hooks file is user-owned: reject unusable shapes rather than replacing them. */
function parseSettings(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw.replace(/^﻿/, ''));
    if (!isPlainObject(parsed)) return undefined;
    const hooks = parsed['hooks'];
    if (hooks !== undefined && !isPlainObject(hooks)) return undefined;
    const afterAgent = (hooks as Record<string, unknown> | undefined)?.['AfterAgent'];
    if (afterAgent !== undefined && !Array.isArray(afterAgent)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Merge one AfterAgent group into .gemini/settings.json, preserving other groups, events and fields. */
export async function installGeminiAfterAgentHook(dir: string): Promise<InstallGeminiAfterAgentHookResult> {
  const path = join(dir, 'settings.json');
  let settings: Record<string, unknown> = {};
  let raw: string | undefined;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err: unknown) {
    // An unreadable file must never be mistaken for a missing one and overwritten.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (raw !== undefined) {
    const parsed = parseSettings(raw);
    if (!parsed) return { status: 'invalid-json', path };
    settings = parsed;
  }
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;
  const afterAgent = (hooks['AfterAgent'] ?? []) as unknown[];
  if (afterAgent.some(group => isPlainObject(group) && Array.isArray(group['hooks']) && group['hooks'].some(isProctorHook))) {
    return { status: 'already', path };
  }
  // Gemini's wildcard matches all turns; its timeout unit is milliseconds.
  afterAgent.push({ matcher: '*', hooks: [{
    name: 'proctor', type: 'command', command: AFTER_AGENT_HOOK_COMMAND, timeout: 60_000,
    description: 'Block AI test tampering before the turn ends',
  }] });
  hooks['AfterAgent'] = afterAgent;
  settings['hooks'] = hooks;
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { status: 'installed', path };
}

/** Remove only proctor's command, including from a group shared with unrelated commands. */
export async function removeGeminiAfterAgentHook(dir: string, dryRun: boolean): Promise<string | undefined> {
  const path = join(dir, 'settings.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  const settings = parseSettings(raw);
  if (!settings) return undefined;
  const hooks = settings['hooks'] as Record<string, unknown> | undefined;
  const afterAgent = (hooks?.['AfterAgent'] ?? []) as unknown[];
  let removed = false;
  const kept = afterAgent.flatMap(group => {
    if (!isPlainObject(group) || !Array.isArray(group['hooks'])) return [group];
    const commands = group['hooks'].filter(h => !isProctorHook(h));
    if (commands.length === group['hooks'].length) return [group];
    removed = true;
    return commands.length > 0 ? [{ ...group, hooks: commands }] : [];
  });
  if (!removed || !hooks) return undefined;
  if (!dryRun) {
    if (kept.length > 0) hooks['AfterAgent'] = kept;
    else delete hooks['AfterAgent'];
    if (Object.keys(hooks).length === 0) delete settings['hooks'];
    await writeFile(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
  return path;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProctorHook(hook: unknown): boolean {
  return isPlainObject(hook) && hook['type'] === 'command' && hook['command'] === AFTER_AGENT_HOOK_COMMAND;
}
