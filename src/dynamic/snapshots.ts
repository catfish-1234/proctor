import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { DynamicOptions } from './runner.js';

export type Snapshot = Map<string, { data: Buffer; mode: number }>;
const EXCLUDED = /^\.proctor-judge-cache(?:$|-)|^(?:bench\/(?:dynamic|heldout)(?:\/|$))|(?:^|\/)(?:\.git|node_modules|\.venv|venv|__pycache__)(?:\/|$)/;
const MAX_BYTES = 64 * 1024 * 1024;
export function git(cwd: string, args: string[], input?: string): Buffer {
  const r = spawnSync('git', args, { cwd, input, maxBuffer: MAX_BYTES, timeout: 15_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1' } });
  if (r.status !== 0) throw Error('cannot read local Git snapshot');
  return r.stdout;
}
function validPath(path: string): boolean {
  return !isAbsolute(path) && !path.split('/').some(p => p === '..' || p === '' || p.includes('\\'));
}
function snapshot(cwd: string, ref?: string): Snapshot {
  const entries = git(cwd, ref ? ['ls-tree', '-rz', '--full-tree', ref] : ['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean)
    .map(row => {
      const tab = row.indexOf('\t');
      const meta = row.slice(0, tab).split(' '), path = row.slice(tab + 1);
      return { path, mode: meta[0]!, sha: meta[ref ? 2 : 1]! };
    }).filter(e => !EXCLUDED.test(e.path));
  if (entries.some(e => !validPath(e.path) || !/^100(644|755)$/.test(e.mode))) throw Error('not run: symlink, submodule or unsafe tracked path');
  const blobs = git(cwd, ['cat-file', '--batch'], entries.map(e => e.sha).join('\n') + '\n');
  const files: Snapshot = new Map();
  let offset = 0;
  for (const entry of entries) {
    const newline = blobs.indexOf(10, offset);
    const [sha, kind, sizeText] = blobs.subarray(offset, newline).toString().split(' ');
    const size = Number(sizeText);
    if (sha !== entry.sha || kind !== 'blob' || !Number.isSafeInteger(size)) throw Error('unreadable Git blob');
    offset = newline + 1;
    files.set(entry.path, { data: blobs.subarray(offset, offset + size), mode: parseInt(entry.mode, 8) & 0o777 });
    offset += size + 1;
  }
  return files;
}
export function loadSnapshots(options: DynamicOptions): { old: Snapshot; next: Snapshot } {
  const top = git(options.cwd, ['rev-parse', '--show-toplevel']).toString().trim();
  if (resolve(top) !== resolve(options.cwd)) throw Error('not run: invoke dynamic checks at the repository root');
  const ref = options.base ? git(top, ['merge-base', '--', options.base, 'HEAD']).toString().trim() : 'HEAD';
  const old = snapshot(top, ref);
  const next = snapshot(top, options.staged ? undefined : 'HEAD');
  if (!options.base && !options.staged) {
    for (const file of options.files) {
      if (file.from && file.from !== '/dev/null' && file.from !== file.to) next.delete(file.from);
      const path = file.to;
      if (!path || path === '/dev/null') { if (file.from) next.delete(file.from); continue; }
      if (!validPath(path) || EXCLUDED.test(path)) continue;
      const disk = join(top, path);
      if (!existsSync(disk)) { next.delete(path); continue; }
      const stat = lstatSync(disk);
      if (!stat.isFile()) throw Error('not run: changed symlink or non-regular file');
      if (stat.size > MAX_BYTES) throw Error('snapshot size limit');
      next.set(path, { data: readFileSync(disk), mode: stat.mode & 0o777 });
    }
  }
  for (const tree of [old, next]) {
    if ([...tree.values()].reduce((sum, f) => sum + f.data.length, 0) > MAX_BYTES) throw Error('snapshot size limit');
  }
  for (const path of ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'requirements.txt', 'poetry.lock', 'uv.lock']) {
    if (old.get(path)?.data.toString() !== next.get(path)?.data.toString()) throw Error(`not run: dependency manifest changed (${path})`);
  }
  return { old, next };
}

/** No hardlinks or links back to the user's dependency tree. */
function copyDependencies(source: string, target: string, sourceRoot: string, targetRoot: string): void {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    const destination = resolve(dirname(source), readlinkSync(source));
    const rel = relative(sourceRoot, destination);
    if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw Error('not run: dependency symlink points outside node_modules');
    symlinkSync(relative(dirname(target), join(targetRoot, rel)), target);
  } else if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(source)) copyDependencies(join(source, name), join(target, name), sourceRoot, targetRoot);
  } else if (stat.isFile()) {
    copyFileSync(source, target);
    chmodSync(target, stat.mode & 0o777);
  }
}
export function materialize(tree: Snapshot, dir: string, cwd: string): void {
  mkdirSync(dir, { recursive: true });
  for (const [path, file] of tree) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.data, { mode: file.mode });
  }
  const deps = join(cwd, 'node_modules');
  if (existsSync(deps)) copyDependencies(deps, join(dir, 'node_modules'), deps, join(dir, 'node_modules'));
}
