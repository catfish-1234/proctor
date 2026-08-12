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

interface StopHookGroup {
  hooks?: Array<{ command?: string }>;
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
    try {
      settings = JSON.parse(rawSettings) as Record<string, unknown>;
    } catch {
      // A malformed settings file must not be silently replaced, that would destroy
      // whatever configuration the user had in it.
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
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch {
    // Missing or malformed: nothing safe to edit, and rewriting it would risk the user's config.
    return undefined;
  }
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

/** The `Stop` groups in a settings object, or an empty list for any shape that is not a list. */
function readStopGroups(settings: Record<string, unknown>): StopHookGroup[] {
  const stop = (settings['hooks'] as Record<string, unknown> | undefined)?.['Stop'];
  return Array.isArray(stop) ? (stop as StopHookGroup[]) : [];
}

function isProctorGroup(group: StopHookGroup): boolean {
  return group.hooks?.some(h => h.command?.includes(STOP_HOOK_MARKER)) === true;
}
