import { describe, it, expect, vi } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FSWatcher } from 'node:fs';
import { isRelevantChange, startWatch, IGNORED_DIRS } from '../src/watch.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

/** A stand-in watcher whose change events the test drives directly. */
function fakeWatcher(): { factory: Parameters<typeof startWatch>[2]['watchFactory']; fire: (f: string | null) => void; closed: () => boolean } {
  let handler: ((f: string | null) => void) | undefined;
  let closed = false;
  return {
    factory: (_dir, onChange) => {
      handler = onChange;
      return { close: () => { closed = true; } } as unknown as FSWatcher;
    },
    fire: f => handler?.(f),
    closed: () => closed,
  };
}

const tick = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

describe('isRelevantChange', () => {
  it('accepts ordinary source and test files', () => {
    expect(isRelevantChange('src/index.ts')).toBe(true);
    expect(isRelevantChange('tests/a.test.ts')).toBe(true);
    expect(isRelevantChange('a.py')).toBe(true);
  });

  it('ignores churn directories that would re-trigger on every install or build', () => {
    for (const dir of IGNORED_DIRS) {
      expect(isRelevantChange(`${dir}/whatever.js`), dir).toBe(false);
      expect(isRelevantChange(`nested/${dir}/whatever.js`), dir).toBe(false);
    }
  });

  it('ignores editor swap and temp files, which would double every save', () => {
    expect(isRelevantChange('.index.ts.swp')).toBe(false);
    expect(isRelevantChange('index.ts~')).toBe(false);
    expect(isRelevantChange('index.ts.tmp')).toBe(false);
  });

  it('ignores a null filename, which some platforms report', () => {
    expect(isRelevantChange(null)).toBe(false);
  });

  it('does not mistake a file whose name merely contains an ignored word', () => {
    expect(isRelevantChange('src/dist-helper.ts')).toBe(true);
    expect(isRelevantChange('src/build.ts')).toBe(true);
  });
});

describe('startWatch', () => {
  it('collapses a burst of events into a single run', async () => {
    const w = fakeWatcher();
    const onRun = vi.fn(async () => {});
    const handle = startWatch('.', onRun, { debounceMs: 20, watchFactory: w.factory });
    try {
      w.fire('a.ts');
      w.fire('a.ts');
      w.fire('a.ts');
      await tick(60);
      expect(onRun).toHaveBeenCalledTimes(1);
    } finally {
      handle.close();
    }
  });

  it('does not run for an ignored path', async () => {
    const w = fakeWatcher();
    const onRun = vi.fn(async () => {});
    const handle = startWatch('.', onRun, { debounceMs: 10, watchFactory: w.factory });
    try {
      w.fire('node_modules/x.js');
      await tick(40);
      expect(onRun).not.toHaveBeenCalled();
    } finally {
      handle.close();
    }
  });

  it('queues at most one follow-up run while a run is in flight', async () => {
    const w = fakeWatcher();
    let active = 0;
    let maxActive = 0;
    const onRun = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await tick(40);
      active--;
    });
    const handle = startWatch('.', onRun, { debounceMs: 5, watchFactory: w.factory });
    try {
      w.fire('a.ts');
      await tick(20);
      w.fire('b.ts');
      w.fire('c.ts');
      w.fire('d.ts');
      await tick(150);
      // Never overlapping, and the changes during the first run collapse into one follow-up.
      expect(maxActive).toBe(1);
      expect(onRun.mock.calls.length).toBe(2);
    } finally {
      handle.close();
    }
  });

  it('stops running and closes the underlying watcher on close', async () => {
    const w = fakeWatcher();
    const onRun = vi.fn(async () => {});
    const handle = startWatch('.', onRun, { debounceMs: 10, watchFactory: w.factory });
    handle.close();
    w.fire('a.ts');
    await tick(40);
    expect(onRun).not.toHaveBeenCalled();
    expect(w.closed()).toBe(true);
  });
});

describe('watch command', () => {
  it('refuses to start outside a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'watch'], { cwd: dir, encoding: 'utf8', timeout: 20_000 });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('not a git repository');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a nonsense debounce rather than watching with a broken timer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: dir });
      const result = spawnSync('node', [CLI, 'watch', '--debounce', 'soon'], { cwd: dir, encoding: 'utf8', timeout: 20_000 });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('--debounce');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is listed in --help', () => {
    const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
    expect(result.stdout).toContain('watch');
  });
});
