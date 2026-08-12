import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Reading and writing proctor's `Stop` hook entry in a Claude Code `settings.json`.
 *
 * The file belongs to the user and usually holds far more than proctor's entry, so everything here
 * merges rather than replaces: install adds one entry, uninstall removes exactly that entry, and a
 * settings file proctor cannot parse is reported rather than overwritten.
 */

/** The command proctor registers. Fully-scoped, not the bare bin name: see the note below. */
const STOP_HOOK_COMMAND = `npx ${pkg.name} stop-hook`;

/** Marker used to recognize proctor's own entry among whatever else is registered. */
const STOP_HOOK_MARKER = 'proctor stop-hook';

/**
 * Parses settings JSON, tolerating a UTF-8 byte order mark. PowerShell's `Out-File -Encoding utf8`
 * writes one by default on Windows, and `JSON.parse` rejects it, so without this a perfectly valid
 * settings file is reported as malformed. Returns undefined when the text is genuinely not JSON.
 */
function parseSettings(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

export type InstallStopHookStatus = 'installed' | 'already' | 'invalid-json';

export interface InstallStopHookResult {
  status: InstallStopHookStatus;
  path: string;
}

/**
 * Adds the Stop hook to a Claude Code settings file, merging into whatever is already there.
 * Reports rather than throws, so `setup` can carry on with the other installs when this one
 * cannot proceed.
 */
export async function installStopHook(dir: string): Promise<InstallStopHookResult> {
  const settingsPath = join(dir, 'settings.json');
  let settings: Record<string, unknown> = {};
  let rawSettings: string | undefined;
  try {
    rawSettings = await readFile(settingsPath, 'utf8');
  } catch { /* ENOENT, no settings yet, start fresh */ }
  if (rawSettings !== undefined) {
    // A malformed settings file must not be silently replaced, that would destroy
    // whatever configuration the user had in it.
    const parsed = parseSettings(rawSettings);
    // Parseable is not the same as usable. A root that is an array, a string, or null, or a
    // `hooks` that is not an object, or a `Stop` that is not an array, would all either throw
    // while merging or be silently dropped by JSON.stringify and reported as a successful
    // install. Both outcomes are worse than saying the file needs a look.
    if (!isPlainObject(parsed)) return { status: 'invalid-json', path: settingsPath };
    settings = parsed;
    const existingHooks = settings['hooks'];
    if (existingHooks !== undefined && !isPlainObject(existingHooks)) {
      return { status: 'invalid-json', path: settingsPath };
    }
    const existingStop = (existingHooks as Record<string, unknown> | undefined)?.['Stop'];
    if (existingStop !== undefined && !Array.isArray(existingStop)) {
      return { status: 'invalid-json', path: settingsPath };
    }
  }
  // Skip if the hook is already installed, so running this command twice is a no-op.
  if (readStopGroups(settings).some(isProctorGroup)) return { status: 'already', path: settingsPath };

  // Merge into any existing settings rather than overwriting them.
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;
  const stop = (hooks['Stop'] ?? []) as unknown[];
  // Fully-scoped npx spec (not bare `npx proctor`). See preCommitHookContent()'s comment in
  // src/hooks/pre-commit.ts for why: a bare bin name only resolves via npx after a persistent
  // install, which the README's zero-install flow doesn't guarantee.
  stop.push({ hooks: [{ type: 'command', command: STOP_HOOK_COMMAND }] });
  hooks['Stop'] = stop;
  settings['hooks'] = hooks;
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return { status: 'installed', path: settingsPath };
}

/**
 * Drops proctor's Stop hook entry, leaving every other hook and setting untouched. Returns the
 * settings path when something was removed, undefined when there was nothing of proctor's in it.
 */
export async function removeStopHook(dir: string, dryRun: boolean): Promise<string | undefined> {
  const settingsPath = join(dir, 'settings.json');
  let raw: string;
  try {
    raw = await readFile(settingsPath, 'utf8');
  } catch {
    // Missing or unreadable: nothing safe to edit, and rewriting it would risk the user's config.
    return undefined;
  }
  const parsed = parseSettings(raw);
  // A root that is null, an array, or a primitive holds no hooks to remove, and reaching into it
  // would throw. Nothing of proctor's is there, so there is nothing to do.
  if (!isPlainObject(parsed)) return undefined;
  const settings = parsed;
  const groups = readStopGroups(settings);
  const kept = groups.filter(g => !isProctorGroup(g));
  if (kept.length === groups.length) return undefined;

  if (!dryRun) {
    const hooks = settings['hooks'] as Record<string, unknown>;
    if (kept.length > 0) hooks['Stop'] = kept;
    else delete hooks['Stop'];
    // An empty `hooks` object left behind is noise in a file the user reads.
    if (Object.keys(hooks).length === 0) delete settings['hooks'];
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
  return settingsPath;
}

/** A JSON object, as opposed to an array, a primitive, or null, all of which `typeof` calls object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `Stop` groups in a settings object, or an empty list for any shape that is not a list. */
function readStopGroups(settings: Record<string, unknown>): unknown[] {
  const hooks = settings['hooks'];
  if (!isPlainObject(hooks)) return [];
  const stop = hooks['Stop'];
  return Array.isArray(stop) ? stop : [];
}

/**
 * Whether a `Stop` group is proctor's own. Every level is validated rather than assumed: this
 * reads a hand-editable file, and a `Stop` array holding a null, a string, or a group whose
 * `hooks` is not an array are all things a real settings file can contain. Reaching into them
 * blind threw a raw TypeError out of the middle of `setup`.
 */
function isProctorGroup(group: unknown): boolean {
  if (!isPlainObject(group)) return false;
  const hooks = group['hooks'];
  if (!Array.isArray(hooks)) return false;
  return hooks.some(h => isPlainObject(h) && typeof h['command'] === 'string' && h['command'].includes(STOP_HOOK_MARKER));
}
