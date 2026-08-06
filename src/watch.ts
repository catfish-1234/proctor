import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { basename } from 'node:path';

export interface WatchOptions {
  /** Milliseconds of quiet before a run. An editor save fires several events; this collapses them. */
  debounceMs?: number;
  /** Injected for tests, so the loop can be driven without touching the real filesystem. */
  watchFactory?: (dir: string, onChange: (filename: string | null) => void) => FSWatcher;
}

export interface WatchHandle {
  close(): void;
}

/**
 * Directory names that produce constant churn and never contain anything proctor checks. Watching
 * them would mean re-running on every dependency install and every build, which is both useless
 * and loud enough that people turn watch mode off.
 */
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  'target', 'vendor', '__pycache__', '.venv', 'venv', '.tox', '.gradle', '.idea', '.vscode',
]);

/** True when a changed path is worth re-checking. */
export function isRelevantChange(filename: string | null): boolean {
  if (!filename) return false;
  const parts = filename.replace(/\\/g, '/').split('/');
  if (parts.some(p => IGNORED_DIRS.has(p))) return false;
  // Editors write swap and temp files next to the real one. Reacting to those means running twice
  // per save, once on the temp file and once on the real write.
  const name = basename(filename);
  if (name.startsWith('.') && (name.endsWith('.swp') || name.endsWith('.swx') || name.endsWith('~'))) return false;
  return !name.endsWith('~') && !name.endsWith('.tmp');
}

/**
 * Re-runs `onRun` whenever something relevant changes under `dir`.
 *
 * Deliberately a plain debounced fs.watch rather than a full-screen TUI. proctor's output is
 * already the thing you want to read, and a framework that owns the screen would fight the
 * terminal scrollback you need when a run reports something. One run at a time: if changes land
 * while a run is in flight, exactly one more run is queued rather than a pile of them.
 */
export function startWatch(
  dir: string,
  onRun: () => Promise<void>,
  opts: WatchOptions = {}
): WatchHandle {
  const debounceMs = opts.debounceMs ?? 250;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let queued = false;
  let closed = false;

  const run = async (): Promise<void> => {
    if (closed) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await onRun();
    } finally {
      running = false;
      if (queued && !closed) {
        queued = false;
        void run();
      }
    }
  };

  const factory =
    opts.watchFactory ??
    ((d, onChange) => fsWatch(d, { recursive: true }, (_event, filename) => onChange(filename)));

  const watcher = factory(dir, filename => {
    if (!isRelevantChange(filename)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), debounceMs);
  });

  return {
    close(): void {
      closed = true;
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
