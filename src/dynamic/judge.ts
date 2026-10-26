import { spawn } from 'node:child_process';
import { accessSync, constants, lstatSync, mkdirSync, realpathSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { JUDGE_CALL_LIMIT, judgePrompt, parseJudgeVerdict, type JudgeRequest, type JudgeVerdict } from './judge-protocol.js';

export type JudgeCli = 'claude' | 'codex' | 'gemini';
export interface JudgeAnswer { verdict: JudgeVerdict; cli: JudgeCli; cached: boolean }
export function detectJudge(cwd: string, selected?: JudgeCli, env = process.env): { cli: JudgeCli; binary: string } | undefined {
  // Prefer a signed-in subscription path over an environment-key route when auto selecting.
  const choices: JudgeCli[] = selected ? [selected] : ['gemini', 'codex', 'claude'];
  for (const cli of choices) for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    const rel = relative(cwd, dir);
    if (!(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))) continue;
    const binary = join(dir, cli);
    try { accessSync(binary, constants.X_OK); if (lstatSync(binary).isFile() || lstatSync(binary).isSymbolicLink()) {
      const target = relative(cwd, realpathSync(binary));
      if (target === '..' || target.startsWith('..' + sep) || isAbsolute(target)) return { cli, binary };
    } }
    catch { /* A missing or non-executable local command is not an error. */ }
  }
  return undefined;
}
export function judgeCommand(cli: JudgeCli, prompt: string): string[] {
  if (cli === 'claude') return ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands'];
  if (cli === 'codex') return ['exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '-c', 'approval_policy="never"', '-'];
  return ['--prompt', prompt, '--output-format', 'json'];
}
export function unwrapJudge(cli: JudgeCli, stdout: string): string | undefined {
  if (cli === 'codex') return stdout.trim();
  try {
    const outer = JSON.parse(stdout);
    if (outer.is_error === true || outer.error) return undefined;
    const text = cli === 'claude' ? outer.result : outer.response;
    return typeof text === 'string' ? text : undefined;
  } catch { return undefined; /* CLI diagnostics and sign-in messages are not verdicts. */ }
}
/** Local credentials stay outside the project worker. No API client is used here. */
export function createJudge(cwd: string, work: string, deadline: number, signal: AbortSignal, selected?: JudgeCli) {
  const backend = detectJudge(cwd, selected);
  const cachePath = join(cwd, '.proctor-judge-cache');
  let cache: Record<string, string> = {}, calls = 0;
  try {
    const stat = lstatSync(cachePath);
    if (stat.isFile() && stat.size <= 256 * 1024) {
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') cache = parsed;
    }
  } catch { /* A missing or unreadable cache is a cold cache. */ }
  return async (request: JudgeRequest): Promise<JudgeAnswer | null> => {
    const prompt = judgePrompt(request);
    if (!backend || !prompt || signal.aborted || Date.now() >= deadline) return null;
    const key = createHash('sha256').update('DY009:1\n' + backend.cli + '\n' + prompt).digest('hex');
    if (typeof cache[key] === 'string') {
      const verdict = parseJudgeVerdict(cache[key]!, request);
      if (verdict) return { verdict, cli: backend.cli, cached: true };
    }
    if (calls >= JUDGE_CALL_LIMIT) return null;
    calls++;
    const timeout = Math.min(10_000, deadline - Date.now());
    if (timeout <= 0) return null;
    const output = await new Promise<string | undefined>((resolve) => {
      // The CLI can reach its service and read its own login. It cannot write the user's
      // tree. Its working directory contains no project files or project configuration.
      const args = ['--die-with-parent', '--unshare-pid', '--ro-bind', '/', '/', '--bind', work, work, '--proc', '/proc', '--dev', '/dev'];
      let stateFile: string | undefined;
      if (backend.cli === 'codex') {
        const configuredHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
        let seedFile: string | undefined;
        try {
          if (!isAbsolute(configuredHome)) throw new Error('Codex home is not absolute');
          const codexHome = realpathSync(configuredHome), home = realpathSync(homedir());
          const homePath = relative(home, codexHome);
          if (homePath === '..' || homePath.startsWith('..' + sep) || isAbsolute(homePath)) throw new Error('Codex home is outside the user home');
          seedFile = join(codexHome, 'installation_id');
          const stat = lstatSync(seedFile);
          if (!stat.isFile() || stat.size > 4096) throw new Error('Unsafe codex installation identity');
          const seedPath = relative(codexHome, realpathSync(seedFile));
          if (seedPath === '..' || seedPath.startsWith('..' + sep) || isAbsolute(seedPath)) throw new Error('Codex installation identity is outside its home');
          const seed = readFileSync(seedFile);
          if (seed.length > 4096 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seed.toString('utf8').trim())) throw new Error('Invalid codex installation identity');
          if (!lstatSync(work).isDirectory() || realpathSync(work) !== work) throw new Error('Unsafe judge work directory');
          // Codex needs a private writable copy of its existing installation identity.
          stateFile = join(work, 'codex-state', 'installation_id');
          rmSync(dirname(stateFile), { recursive: true, force: true });
          mkdirSync(dirname(stateFile), { mode: 0o700 });
          writeFileSync(stateFile, seed, { flag: 'wx', mode: 0o600 });
          args.push('--bind', stateFile, seedFile);
        } catch (error) {
          const failure = error as NodeJS.ErrnoException;
          if (failure.code === 'ENOENT' && (failure.path === configuredHome || failure.path === seedFile)) process.stderr.write('proctor judge: codex installation_id is missing; writable bind skipped\n');
          // Unsafe or unavailable state keeps the existing read-only sandbox.
        }
      }
      args.push('--', backend.binary, ...judgeCommand(backend.cli, prompt));
      const child = spawn('bwrap', args, { cwd: work, env: { ...process.env, TMPDIR: join(work, 'tmp'), TMP: join(work, 'tmp'), TEMP: join(work, 'tmp') }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', invalid = false;
      const kill = () => {
        if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); }
        catch { /* The CLI group may already have exited; termination is idempotent. */ }
      };
      const onInt = () => { kill(); process.exit(130); }, onTerm = () => { kill(); process.exit(143); };
      const abort = () => { invalid = true; kill(); };
      process.once('exit', kill); process.once('SIGINT', onInt); process.once('SIGTERM', onTerm);
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, timeout);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); if (stdout.length > 64 * 1024) abort(); });
      child.stderr.resume();
      child.stdin.on('error', () => { /* An unsigned-in command can exit before reading its prompt. */ });
      child.stdin.end(backend.cli === 'gemini' ? undefined : prompt);
      child.once('error', () => { invalid = true; });
      child.once('close', code => {
        clearTimeout(timer); kill(); signal.removeEventListener('abort', abort);
        process.removeListener('exit', kill); process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
        if (stateFile) try { rmSync(dirname(stateFile), { recursive: true, force: true }); }
        catch { /* The per-run work directory cleanup also removes transient state. */ }
        resolve(!invalid && code === 0 ? unwrapJudge(backend.cli, stdout) : undefined);
      });
    });
    const verdict = output === undefined ? undefined : parseJudgeVerdict(output, request);
    if (!verdict) return null;
    cache[key] = JSON.stringify(verdict);
    try {
      // Replace atomically. Never follow an existing link when persisting proposals.
      let writable = true;
      try { const stat = lstatSync(cachePath); writable = stat.isFile() && stat.nlink === 1; }
      catch { /* An absent cache can be created. */ }
      if (writable) {
        const entries = Object.entries(cache).slice(-64);
        const data = JSON.stringify(Object.fromEntries(entries));
        if (Buffer.byteLength(data) <= 256 * 1024) {
          // Stage beside the destination with exclusive creation. Never follow a path
          // left by the CLI in its writable work directory.
          const staged = join(dirname(cachePath), `.proctor-judge-cache-${process.pid}-${key.slice(0, 12)}`);
          writeFileSync(staged, data, { flag: 'wx', mode: 0o600 });
          try { renameSync(staged, cachePath); }
          finally { rmSync(staged, { force: true }); }
        }
      }
    } catch { /* Cache persistence is optional and must never change the check result. */ }
    return { verdict, cli: backend.cli, cached: false };
  };
}
