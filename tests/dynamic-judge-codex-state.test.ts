import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createJudge, type JudgeCli } from '../src/dynamic/judge.js';
import { judgePrompt, type JudgeRequest } from '../src/dynamic/judge-protocol.js';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn() };
});
const { spawn: realSpawn } = await vi.importActual<typeof import('node:child_process')>('node:child_process');
const toolPath = process.env.PATH;
const request: JudgeRequest = { name: 'compute', arity: 1, before: 'x=>x', after: 'x=>x.slice(0,1)', sentences: ['`app.compute(x)` keeps every character.'] };
const verdict = { violation: 'yes', quote: request.sentences[0], claim: { kind: 'width' } };
const seed = '  2d327c9c-b844-4c7b-a1d4-336ec18fd11d\n';
let root: string, home: string, codexHome: string, work: string, repo: string, bin: string;

function output(cli: JudgeCli = 'codex', code = 0) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  setImmediate(() => {
    const text = JSON.stringify(verdict);
    child.stdout.end(cli === 'codex' ? text : JSON.stringify(cli === 'claude' ? { result: text } : { response: text }));
    child.emit('close', code);
  });
  return child as ChildProcessWithoutNullStreams;
}
function ask(cli: JudgeCli = 'codex') {
  return createJudge(repo, work, Date.now() + 5000, new AbortController().signal, cli)(request);
}
function baseArgs() {
  return ['--die-with-parent', '--unshare-pid', '--ro-bind', '/', '/', '--bind', work, work, '--proc', '/proc', '--dev', '/dev'];
}
function capturedArgs() { return vi.mocked(spawn).mock.calls[0]![1]; }
function expectSkipped() {
  expect(capturedArgs()).toEqual([...baseArgs(), '--', join(bin, 'codex'), 'exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '-c', 'approval_policy="never"', '-']);
  expect(existsSync(join(work, 'codex-state'))).toBe(false);
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'proctor-codex-state-'));
  home = join(root, 'home'); codexHome = join(home, '.codex'); work = join(root, 'work'); repo = join(root, 'repo'); bin = join(root, 'bin');
  for (const dir of [codexHome, work, repo, bin, join(work, 'tmp')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(codexHome, 'installation_id'), seed);
  for (const cli of ['codex', 'claude', 'gemini']) writeFileSync(join(bin, cli), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  vi.stubEnv('HOME', home); vi.stubEnv('CODEX_HOME', undefined); vi.stubEnv('PATH', bin);
  vi.mocked(spawn).mockReset().mockImplementation(() => output());
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('codex judge installation identity bind', () => {
  it('lets fake codex write installation_id while real writes to auth.json and siblings fail with EROFS', async () => {
    const bwrap = (toolPath ?? '').split(delimiter).map(dir => join(dir, 'bwrap')).find(path => existsSync(path));
    expect(bwrap, 'bubblewrap is required for the file bind contract').toBeDefined();
    symlinkSync(bwrap!, join(bin, 'bwrap'));
    writeFileSync(join(bin, 'codex'), `#!${process.execPath}
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const home = process.env.CODEX_HOME || path.join(process.env.HOME, '.codex');
const file = path.join(home, 'installation_id');
const report = {};
try {
  const fd = fs.openSync(file, 'r+');
  try {
    report.content = fs.readFileSync(fd, 'utf8');
    assert.equal(report.content, ${JSON.stringify(seed)});
    fs.writeSync(fd, Buffer.from(report.content), 0, Buffer.byteLength(report.content), 0);
    report.installationWrite = 'ok';
  } finally { fs.closeSync(fd); }
} catch (error) { report.installationWrite = error.code || error.message; }
for (const name of ['auth.json', 'new-sibling']) {
  try { fs.writeFileSync(path.join(home, name), 'forbidden'); report[name] = 'writable'; }
  catch (error) { report[name] = error.code; }
}
fs.writeFileSync('contract.json', JSON.stringify(report));
assert.equal(report.installationWrite, 'ok', 'installation_id-write: ' + report.installationWrite);
assert.equal(report['auth.json'], 'EROFS');
assert.equal(report['new-sibling'], 'EROFS');
fs.writeSync(1, ${JSON.stringify(JSON.stringify(verdict))});
`);
    let stderr = '', stdout = '', exitCode: number | null = null, boundContent: Buffer | undefined;
    vi.mocked(spawn).mockImplementation((command, args, options) => {
      const child = realSpawn(command, args, options);
      child.stderr?.on('data', data => { stderr += data.toString(); });
      child.stdout?.on('data', data => { stdout += data.toString(); });
      child.once('exit', code => {
        exitCode = code;
        const file = join(work, 'codex-state', 'installation_id');
        if (existsSync(file)) boundContent = readFileSync(file);
      });
      return child;
    });
    const answer = await ask();
    expect(existsSync(join(work, 'contract.json')), stderr).toBe(true);
    const report = JSON.parse(readFileSync(join(work, 'contract.json'), 'utf8'));
    expect(report.installationWrite, `installation_id-write: ${report.installationWrite}\n${stderr}`).toBe('ok');
    expect(report).toEqual({ installationWrite: 'ok', content: seed, 'auth.json': 'EROFS', 'new-sibling': 'EROFS' });
    expect(answer, JSON.stringify({ stderr, stdout, exitCode })).toEqual({ verdict, cli: 'codex', cached: false });
    expect(boundContent).toEqual(Buffer.from(seed));
    expect(readFileSync(join(codexHome, 'installation_id'), 'utf8')).toBe(seed);
    expect(existsSync(join(codexHome, 'auth.json'))).toBe(false);
    expect(existsSync(join(codexHome, 'new-sibling'))).toBe(false);
    expect(existsSync(join(work, 'codex-state'))).toBe(false);
  });

  it('binds only a fresh private file before the command separator and leaves the host seed untouched', async () => {
    const stateFile = join(work, 'codex-state', 'installation_id');
    vi.mocked(spawn).mockImplementation(() => {
      expect(readFileSync(stateFile)).toEqual(Buffer.from(seed));
      expect(lstatSync(stateFile).mode & 0o777).toBe(0o600);
      expect(lstatSync(stateFile).ino).not.toBe(lstatSync(join(codexHome, 'installation_id')).ino);
      writeFileSync(stateFile, 'changed by fake codex');
      return output();
    });
    expect((await ask())?.verdict).toEqual(verdict);
    expect(capturedArgs()).toEqual([...baseArgs(), '--bind', stateFile, join(codexHome, 'installation_id'), '--', join(bin, 'codex'), 'exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '-c', 'approval_policy="never"', '-']);
    expect(readFileSync(join(codexHome, 'installation_id'), 'utf8')).toBe(seed);
    expect(existsSync(stateFile)).toBe(false);
  });

  it('resolves a configured codex home inside HOME', async () => {
    const custom = join(home, 'custom'); mkdirSync(custom);
    writeFileSync(join(custom, 'installation_id'), seed);
    const alias = join(home, 'alias'); symlinkSync(custom, alias);
    vi.stubEnv('CODEX_HOME', alias);
    await ask();
    expect(capturedArgs()).toContain(join(custom, 'installation_id'));
    expect(capturedArgs()).not.toContain(join(alias, 'installation_id'));
  });

  for (const hazard of ['symlink outside', 'symlink inside', 'directory', 'oversized', 'invalid UUID'] as const) it(`skips an installation_id that is ${hazard}`, async () => {
    const file = join(codexHome, 'installation_id'); rmSync(file);
    if (hazard.startsWith('symlink')) {
      const target = join(hazard === 'symlink inside' ? codexHome : root, 'seed');
      writeFileSync(target, seed); symlinkSync(target, file);
    } else if (hazard === 'directory') mkdirSync(file);
    else writeFileSync(file, hazard === 'oversized' ? seed.padEnd(4097, ' ') : 'not-a-uuid');
    expect((await ask())?.verdict).toEqual(verdict);
    expectSkipped();
  });

  for (const redirected of [false, true]) it(`skips a codex home ${redirected ? 'resolving' : 'configured'} outside HOME`, async () => {
    const outside = join(root, 'home-other'); mkdirSync(outside);
    writeFileSync(join(outside, 'installation_id'), seed);
    const configured = redirected ? join(home, 'redirected') : outside;
    if (redirected) symlinkSync(outside, configured);
    vi.stubEnv('CODEX_HOME', configured);
    expect((await ask())?.verdict).toEqual(verdict);
    expectSkipped();
  });

  it('skips a relative CODEX_HOME even when it resolves inside HOME', async () => {
    vi.stubEnv('CODEX_HOME', relative(process.cwd(), codexHome));
    await ask();
    expectSkipped();
  });

  it('keeps a missing host identity absent, records a diagnostic and preserves the failed call', async () => {
    const file = join(codexHome, 'installation_id'); rmSync(file);
    const note = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(spawn).mockImplementation(() => output('codex', 1));
    expect(await ask()).toBeNull();
    expectSkipped();
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(repo, '.proctor-judge-cache'))).toBe(false);
    expect(note.mock.calls.map(call => String(call[0])).join('')).toMatch(/installation_id.*missing.*bind skipped\n/);
  });

  for (const leftover of ['directory link', 'file link', 'stale file'] as const) it(`replaces a leftover ${leftover} without following it`, async () => {
    const outside = join(root, 'outside'); mkdirSync(outside);
    const target = join(outside, 'installation_id'); writeFileSync(target, 'untouched');
    const stateDir = join(work, 'codex-state'), stateFile = join(stateDir, 'installation_id');
    if (leftover === 'directory link') symlinkSync(outside, stateDir);
    else {
      mkdirSync(stateDir);
      if (leftover === 'file link') symlinkSync(target, stateFile);
      else writeFileSync(stateFile, 'stale');
    }
    vi.mocked(spawn).mockImplementation(() => {
      expect(lstatSync(stateDir).isSymbolicLink()).toBe(false);
      expect(lstatSync(stateFile).isSymbolicLink()).toBe(false);
      expect(readFileSync(stateFile, 'utf8')).toBe(seed);
      return output();
    });
    await ask();
    expect(readFileSync(target, 'utf8')).toBe('untouched');
    expect(existsSync(stateDir)).toBe(false);
  });

  it('does not follow a replaced work directory symlink', async () => {
    rmSync(work, { recursive: true });
    const outside = join(root, 'outside'); mkdirSync(outside); symlinkSync(outside, work);
    await ask();
    expectSkipped();
    expect(existsSync(join(outside, 'codex-state'))).toBe(false);
  });

  for (const code of [0, 1]) it(`removes state on close with exit code ${code}`, async () => {
    vi.mocked(spawn).mockImplementation(() => {
      expect(existsSync(join(work, 'codex-state', 'installation_id'))).toBe(true);
      return output('codex', code);
    });
    await ask();
    expect(existsSync(join(work, 'codex-state'))).toBe(false);
  });

  for (const cli of ['claude', 'gemini'] as const) it(`preserves the complete ${cli} bwrap argument vector`, async () => {
    vi.mocked(spawn).mockImplementation(() => output(cli));
    expect((await ask(cli))?.verdict).toEqual(verdict);
    const command = cli === 'claude' ? ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands'] : ['--prompt', judgePrompt(request)!, '--output-format', 'json'];
    expect(capturedArgs()).toEqual([...baseArgs(), '--', join(bin, cli), ...command]);
    expect(existsSync(join(work, 'codex-state'))).toBe(false);
  });
});
