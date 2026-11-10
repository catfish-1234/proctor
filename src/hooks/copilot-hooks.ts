import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Reading and writing proctor's `agentStop` entry in a GitHub Copilot repository hook file,
 * `.github/hooks/proctor.json`.
 *
 * Contract source: GitHub's Copilot hooks reference (docs.github.com/en/copilot/reference/
 * hooks-reference), verified 2026-11-10. Repository hook files are JSON with `version: 1` and a
 * `hooks` object whose event arrays hold command entries. `agentStop` fires when the main agent
 * finishes a turn; a `{"decision":"block","reason":...}` JSON object on stdout forces another
 * turn with reason as the prompt, and silence allows. This integration is contract-verified
 * against that documentation only. It has never been live-verified against a real Copilot CLI or
 * cloud agent session, which is why the adapter is experimental and opt-in.
 *
 * Copilot CLI honors `bash`/`powershell`/`command` per platform; the cloud agent's Linux sandbox
 * honors only `bash`, with the cross-platform `command` field as fallback. All three are written
 * with the same invocation so either surface runs the same handler. Other `.github/hooks/*.json`
 * files load independently, so proctor's own file can never disable a foreign hook, and a
 * malformed entry in this file drops only that entry, per the documented item-level tolerance.
 */

const STOP_HOOK_COMMAND = `npx ${pkg.name} stop-hook --format copilot`;

/** Marker recognizing proctor's own entry among whatever else is in the event array. */
const STOP_HOOK_MARKER = 'proctor stop-hook --format copilot';

export type InstallCopilotStopHookStatus = 'installed' | 'already' | 'invalid-json';

export interface InstallCopilotStopHookResult {
  status: InstallCopilotStopHookStatus;
  path: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses the hook file, tolerating a UTF-8 BOM (PowerShell writes one by default). Returns
 * undefined when the text is not JSON, or when the root, `hooks`, or `agentStop` shapes are ones
 * a merge would destroy: a hand-edited file is user-owned, so unusable shapes are reported,
 * never replaced.
 */
function parseHookFile(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw.replace(/^﻿/, ''));
    if (!isPlainObject(parsed)) return undefined;
    if (parsed['version'] !== 1) return undefined;
    const hooks = parsed['hooks'];
    if (hooks !== undefined && !isPlainObject(hooks)) return undefined;
    const stop = (hooks as Record<string, unknown> | undefined)?.['agentStop'];
    if (stop !== undefined && !Array.isArray(stop)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function isProctorEntry(entry: unknown): boolean {
  if (!isPlainObject(entry) || entry['type'] !== 'command') return false;
  return [entry['command'], entry['bash'], entry['powershell']].some(
    field => typeof field === 'string' && field.includes(STOP_HOOK_MARKER),
  );
}

function proctorEntry(): Record<string, unknown> {
  return {
    type: 'command',
    // Fully-scoped npx spec (not bare `npx proctor`): a bare bin name only resolves via npx after
    // a persistent install, which the README's zero-install flow doesn't guarantee. See
    // preCommitHookContent()'s comment in src/hooks/pre-commit.ts.
    command: STOP_HOOK_COMMAND,
    bash: STOP_HOOK_COMMAND,
    powershell: STOP_HOOK_COMMAND,
    // 90s: proctor's internal Stop check caps itself at 60s and fails open past that; the hook
    // timeout must outlive it or Copilot would kill the handler mid-check (documented default
    // is 30s, too short). A hook timeout is documented fail-open, never a block.
    timeoutSec: 90,
  };
}

/**
 * Merges proctor's `agentStop` entry into `.github/hooks/proctor.json`, preserving every other
 * event, entry, and field already in the file. Other hook files in the directory are never
 * touched. Reports rather than throws so `setup` can carry on with the other installs.
 */
export async function installCopilotStopHook(dir: string): Promise<InstallCopilotStopHookResult> {
  const path = join(dir, 'proctor.json');
  let settings: Record<string, unknown> = { version: 1 };
  let raw: string | undefined;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err: unknown) {
    // An unreadable file must never be mistaken for a missing one and overwritten.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (raw !== undefined) {
    const parsed = parseHookFile(raw);
    if (!parsed) return { status: 'invalid-json', path };
    settings = parsed;
  }
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;
  const stop = (hooks['agentStop'] ?? []) as unknown[];
  if (stop.some(isProctorEntry)) return { status: 'already', path };
  stop.push(proctorEntry());
  hooks['agentStop'] = stop;
  settings['hooks'] = hooks;
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { status: 'installed', path };
}

/**
 * Removes only proctor's `agentStop` entry, including from an array shared with unrelated
 * entries, leaving every other event, entry, and field untouched. Returns the path when
 * something was removed, undefined when there was nothing of proctor's in it.
 */
export async function removeCopilotStopHook(dir: string, dryRun: boolean): Promise<string | undefined> {
  const path = join(dir, 'proctor.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  const settings = parseHookFile(raw);
  if (!settings) return undefined;
  const hooks = settings['hooks'] as Record<string, unknown> | undefined;
  const stop = (hooks?.['agentStop'] ?? []) as unknown[];
  const kept = stop.filter(entry => !isProctorEntry(entry));
  if (kept.length === stop.length || !hooks) return undefined;
  if (!dryRun) {
    if (kept.length > 0) hooks['agentStop'] = kept;
    else delete hooks['agentStop'];
    if (Object.keys(hooks).length === 0) delete settings['hooks'];
    await writeFile(path, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
  return path;
}
