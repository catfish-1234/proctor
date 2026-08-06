import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * A running tally of what proctor has caught in this checkout, for the statusline.
 *
 * Deliberately stored inside `.git/`, not the working tree. It is local, per-clone, disposable
 * state: it must never be committed, never show up in a diff, and never need a .gitignore entry
 * in someone else's repo. Nothing reads it except the statusline, so a lost or corrupt file is a
 * cosmetic problem, and every read here fails soft to a zeroed tally rather than throwing.
 */
export interface SessionTally {
  /** Turns or commits blocked because at least one error-severity finding fired. */
  caught: number;
  /** Rule IDs seen, most recent last, capped so the file cannot grow without bound. */
  recentRules: string[];
  /** ISO 8601 timestamp of the last blocked run, or undefined if nothing has been caught yet. */
  lastCaughtAt?: string;
}

const EMPTY: SessionTally = { caught: 0, recentRules: [] };
const MAX_RECENT_RULES = 20;
export const SESSION_FILENAME = 'proctor-session.json';

/**
 * Resolves `<git-dir>/proctor-session.json`. Uses `git rev-parse --git-dir` rather than assuming
 * `.git` is a directory, so this still lands in the right place inside a worktree or a submodule,
 * where `.git` is a file pointing elsewhere. Returns undefined outside a repository.
 */
export function sessionPath(cwd: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  const gitDir = result.stdout.trim();
  return gitDir ? join(gitDir, SESSION_FILENAME) : undefined;
}

function isValid(value: unknown): value is SessionTally {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { caught?: unknown; recentRules?: unknown };
  return typeof v.caught === 'number' && Number.isFinite(v.caught) && Array.isArray(v.recentRules);
}

/** Missing, unreadable, or malformed all read as an empty tally. */
export function readTally(cwd: string): SessionTally {
  const path = sessionPath(cwd);
  if (!path) return { ...EMPTY };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (isValid(parsed)) return parsed;
  } catch {
    // Never installed, or hand-mangled. Either way there is nothing to count.
  }
  return { ...EMPTY };
}

/**
 * Records one blocked run. Silently does nothing when the tally cannot be written, because this
 * is a display counter: failing to update it must never affect whether a turn is blocked.
 */
export function recordCaught(cwd: string, ruleIds: string[], now: Date = new Date()): void {
  const path = sessionPath(cwd);
  if (!path) return;
  const tally = readTally(cwd);
  const next: SessionTally = {
    caught: tally.caught + 1,
    recentRules: [...tally.recentRules, ...ruleIds].slice(-MAX_RECENT_RULES),
    lastCaughtAt: now.toISOString(),
  };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8');
  } catch {
    // Display state only.
  }
}

/** Resets the tally, for starting a fresh measurement. */
export function resetTally(cwd: string): boolean {
  const path = sessionPath(cwd);
  if (!path) return false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(EMPTY, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}
