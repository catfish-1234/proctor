import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Durable "unresolved findings" state for harnesses whose Stop hook cannot be terminal.
 *
 * What this is: bounded local feedback. When an agent keeps ending turns with a finding after the
 * hook's block budget is spent, the hook records that fact in the worktree's git directory, and
 * the pre-commit gate and `proctor unresolved` refuse to call the tree clean until a fresh,
 * complete check passes.
 *
 * What this is NOT: tamper-proof enforcement. The record is a file the agent's own user can
 * delete, and local git hooks can be bypassed (`--no-verify`). Only a CI check on the pushed diff,
 * run outside the agent's write/admin scope, is independent of the agent session.
 */
export const UNRESOLVED_SCHEMA = 1;
const MAX_FINDING_CHARS = 8000;

export interface UnresolvedRecord {
  schema: number;
  source: string;
  /** Opaque harness conversation id, for provenance. Never transcript or prompt content. */
  conversationId?: string;
  /** HEAD when the first unresolved finding was recorded: a clearing check must cover base..HEAD. */
  baseHead: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** How many exhausted stops were recorded for this worktree. */
  occurrences: number;
  blockBudget: number;
  /** The first finding output, as proctor printed it (capped). */
  originalFindings: string;
  /** The most recent finding output (capped). */
  latestFindings: string;
}

export type UnresolvedRead =
  | { state: 'none' }
  | { state: 'unresolved'; record: UnresolvedRecord; path: string }
  /** The file exists but cannot be trusted. Treated as unresolved, never as clean. */
  | { state: 'corrupt'; path: string; reason: string };

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

/**
 * The per-worktree git directory. `--absolute-git-dir` is right for plain clones, linked worktrees
 * (where `.git` is a file) and submodules, and each linked worktree gets its own state, matching
 * the working tree whose files were actually checked.
 */
export function unresolvedPath(cwd: string): string | undefined {
  const dir = git(cwd, ['rev-parse', '--absolute-git-dir']);
  return dir.ok && dir.out ? join(dir.out, 'proctor', 'unresolved.json') : undefined;
}

export function currentHead(cwd: string): string | null {
  const head = git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  return head.ok && head.out ? head.out : null;
}

/**
 * Best-effort removal of credential-looking literals before findings are written to disk. Findings
 * can quote source lines, and the record outlives the session. Patterns are conservative and will
 * miss unusual secrets: the record is local, mode 0600, and inside the git directory.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED private key]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED token]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED aws key]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b|\bnpm_[A-Za-z0-9]{30,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED token]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|secret|token|api[_-]?key|auth)(["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1$2[REDACTED]');
}

/** Opaque ids from a harness are untrusted input: keep printable, short, never path-like. */
export function sanitizeConversationId(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  const clean = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return clean.length > 0 ? clean : undefined;
}

function cap(text: string): string {
  text = redactSecrets(text);
  return text.length > MAX_FINDING_CHARS ? text.slice(0, MAX_FINDING_CHARS) + '\n[truncated]\n' : text;
}

function isRecord(value: unknown): value is UnresolvedRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return r['schema'] === UNRESOLVED_SCHEMA && typeof r['firstSeenAt'] === 'string'
    && typeof r['originalFindings'] === 'string' && typeof r['occurrences'] === 'number'
    && (r['baseHead'] === null || typeof r['baseHead'] === 'string');
}

export function readUnresolved(cwd: string): UnresolvedRead {
  const path = unresolvedPath(cwd);
  if (!path) return { state: 'none' };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'none' };
    return { state: 'corrupt', path, reason: 'unreadable' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? { state: 'unresolved', record: parsed, path } : { state: 'corrupt', path, reason: 'unrecognized format' };
  } catch {
    return { state: 'corrupt', path, reason: 'not valid JSON' };
  }
}

/** Short exclusive lock so concurrent hooks (parallel agents, one worktree) do not lose updates. */
function withLock<T>(lockFile: string, fn: () => T): T | undefined {
  // Generous deadline: with many parallel hook processes (Windows especially spawns slowly), a
  // short one silently drops findings, which is worse than a slow hook.
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      break;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return undefined;
      // Only break a lock old enough that its holder is almost certainly dead, and only when the
      // recorded holder pid is gone: a live process doing slow work is never evicted.
      try { if (Date.now() - statSync(lockFile).mtimeMs > 60_000 && !lockHolderAlive(lockFile)) rmSync(lockFile, { force: true }); } catch { /* raced */ }
      if (Date.now() > deadline) return undefined;
      const wait = Date.now() + 10 + Math.floor(Math.random() * 40);
      while (Date.now() < wait) { /* brief spin: hook processes are short-lived */ }
    }
  }
  try { return fn(); } finally { rmSync(lockFile, { force: true }); }
}

/** True when the pid recorded in the lock file still runs (EPERM means alive, owned by another user). */
function lockHolderAlive(lockFile: string): boolean {
  try {
    const pid = Number(readFileSync(lockFile, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
  } catch {
    return false; // unreadable or legacy empty lock: no live holder can be proven
  }
}

/** Windows transiently refuses a replace-rename (EPERM/EBUSY) while a reader has the file open. */
function renameWithRetry(src: string, dest: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(src, dest);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      const wait = Date.now() + 25;
      while (Date.now() < wait) { /* brief spin */ }
    }
  }
}

export interface RecordInput {
  cwd: string;
  source: string;
  conversationId?: string;
  findings: string;
  blockBudget: number;
  now?: Date;
}

/** Records or updates the unresolved state atomically. Returns the path, or undefined if it could not be written. */
export function recordUnresolved(input: RecordInput): string | undefined {
  const path = unresolvedPath(input.cwd);
  if (!path) return undefined;
  const now = (input.now ?? new Date()).toISOString();
  try {
    mkdirSync(join(path, '..'), { recursive: true });
  } catch {
    return undefined;
  }
  const written = withLock(path + '.lock', () => {
    const existing = readUnresolved(input.cwd);
    // The first record's provenance and baseline are kept: a later exhausted stop must not move
    // the baseline forward and so shrink the range a clearing check has to cover.
    const prior = existing.state === 'unresolved' ? existing.record : undefined;
    const record: UnresolvedRecord = {
      schema: UNRESOLVED_SCHEMA,
      source: prior?.source ?? input.source,
      conversationId: prior?.conversationId ?? sanitizeConversationId(input.conversationId),
      baseHead: prior ? prior.baseHead : currentHead(input.cwd),
      firstSeenAt: prior?.firstSeenAt ?? now,
      lastSeenAt: now,
      occurrences: (prior?.occurrences ?? 0) + 1,
      blockBudget: input.blockBudget,
      originalFindings: prior?.originalFindings ?? cap(input.findings),
      latestFindings: cap(input.findings),
    };
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    renameWithRetry(tmp, path); // atomic replace: readers see the old or the new record, never a partial one
    return path;
  });
  return written;
}

export type VerifyStatus =
  | { status: 'none' }
  /** Fresh complete check ran clean: the record was removed. */
  | { status: 'cleared' }
  | { status: 'unresolved'; detail: string }
  /** Proctor could not complete the check (error, unreadable record, lost baseline). Record kept. */
  | { status: 'unverified'; detail: string };

export type CheckRunner = (cwd: string, args: string[]) => number | null;

/** Default runner: this same proctor CLI, in the worktree, with its output kept off the user's terminal. */
export function cliCheckRunner(cliPath: string): CheckRunner {
  return (cwd, args) => spawnSync(process.execPath, [cliPath, 'check', '--ci', ...args], { cwd, stdio: 'ignore', timeout: 120_000 }).status;
}

/**
 * Clears the record only after a fresh, COMPLETE check: the working tree against HEAD, and, when
 * the record has a baseline, everything committed since that baseline. A pre-commit `--staged`
 * check, a Stop hook `--uncommitted` check, or a commit that moved the cheat out of the working
 * tree are each a partial view and never clear it. Exit 0 and 1 (warnings only) count as clean;
 * 2 is a finding; anything else, or a baseline that no longer resolves, leaves the record and
 * reports `unverified` so uncertainty is never shown as clean.
 */
export function verifyUnresolved(cwd: string, run: CheckRunner): VerifyStatus {
  const state = readUnresolved(cwd);
  if (state.state === 'none') return { status: 'none' };
  if (state.state === 'corrupt') return { status: 'unverified', detail: `record at ${state.path} is ${state.reason}; fix or remove it after reviewing` };
  const { record, path } = state;
  const runs: Array<[string, string[]]> = [['working tree vs HEAD', ['--uncommitted']]];
  if (record.baseHead) {
    const resolved = git(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${record.baseHead}^{commit}`]);
    if (!resolved.ok) return { status: 'unverified', detail: `baseline ${record.baseHead.slice(0, 12)} is no longer in this repository, so committed changes since the finding cannot be checked` };
    runs.push([`commits since ${record.baseHead.slice(0, 12)}`, ['--base', record.baseHead]]);
  }
  for (const [label, args] of runs) {
    const code = run(cwd, args);
    if (code === 2) return { status: 'unresolved', detail: `${label}: findings remain` };
    if (code !== 0 && code !== 1) return { status: 'unverified', detail: `${label}: proctor check did not complete (exit ${code ?? 'timeout'})` };
  }
  // Clear only the record this check actually covered. If another hook recorded a new exhausted
  // stop while the check ran, that finding was not checked: keep it.
  const cleared = withLock(path + '.lock', () => {
    const now = readUnresolved(cwd);
    if (now.state !== 'unresolved' || now.record.occurrences !== record.occurrences || now.record.lastSeenAt !== record.lastSeenAt) return false;
    rmSync(path, { force: true });
    return true;
  });
  if (cleared === undefined) return { status: 'unverified', detail: 'could not take the record lock to clear it' };
  if (!cleared) return { status: 'unresolved', detail: 'the record was updated while the check ran; re-run the check' };
  return { status: 'cleared' };
}

/** True when this worktree's pre-commit hook (git hooks dir or .husky) already runs the unresolved gate. */
export function commitGateInstalled(cwd: string): boolean {
  const hooks = git(cwd, ['rev-parse', '--git-path', 'hooks']);
  const candidates = [join(cwd, '.husky', 'pre-commit')];
  if (hooks.ok && hooks.out) candidates.push(join(resolve(cwd, hooks.out), 'pre-commit'));
  return candidates.some(file => {
    try { return readFileSync(file, 'utf8').includes('unresolved --gate'); } catch { return false; }
  });
}
