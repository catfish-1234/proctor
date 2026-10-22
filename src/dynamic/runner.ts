import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ParsedFile } from '../diff.js';
import type { Finding } from '../types.js';

export interface DynamicOptions {
  cwd: string;
  workerPath: string;
  base?: string;
  staged?: boolean;
  files: ParsedFile[];
  testPathGlobs: string[];
  timeoutMs?: number;
  judge?: boolean;
  judgeCli?: import('./judge.js').JudgeCli;
}
export interface TestRun {
  label: string;
  command: string;
  exitCode: number | null;
  passed: string[];
  failed: string[];
  detail: string;
  fileRuns?: { file: string; command: string; exitCode: number }[];
}
export interface DynamicResult {
  status: 'completed' | 'skipped';
  reason?: string;
  findings: Finding[];
  runs: TestRun[];
  notes: string[];
  elapsedMs: number;
}

/** Entire worker, including snapshot preparation, lives inside one timed process group. */
export async function runDynamic(options: DynamicOptions): Promise<DynamicResult> {
  const started = Date.now();
  const skipped = (reason: string): DynamicResult => ({ status: 'skipped', reason, findings: [], runs: [], notes: [], elapsedMs: Date.now() - started });
  const timeout = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) return skipped('timeout must be an integer from 1 to 2147483647 milliseconds');
  if (process.env['PROCTOR_DYNAMIC_ACTIVE']) return skipped('nested dynamic check');
  if (process.platform !== 'linux') {
    return skipped('not run: this prototype needs Linux and bubblewrap for write and network isolation');
  }
  let scratch: string;
  try { scratch = mkdtempSync(join(tmpdir(), 'proctor-dynamic-')); }
  catch { return skipped('cannot create scratch directory'); }
  let judgeWork: string | undefined;
  const clean = () => {
    for (const dir of [scratch, judgeWork]) if (dir) {
      try { rmSync(dir, { recursive: true, force: true }); }
      catch {
        // Scratch removal is best effort after termination; failure must not turn an optional run into a check failure.
      }
    }
  };
  try {
    mkdirSync(join(scratch, 'tmp'));
    const controller = new AbortController();
    let ask: ((request: import('./judge-protocol.js').JudgeRequest) => Promise<import('./judge.js').JudgeAnswer | null>) | undefined;
    if (options.judge) {
      judgeWork = mkdtempSync(join(tmpdir(), 'proctor-judge-'));
      mkdirSync(join(judgeWork, 'tmp'));
      const { createJudge } = await import('./judge.js');
      ask = createJudge(options.cwd, judgeWork, started + timeout, controller.signal, options.judgeCli);
    }
    writeFileSync(join(scratch, 'input.json'), JSON.stringify({ ...options, files: options.files.map(({ from, to }) => ({ from, to })) }));
    // Deliberately small environment: do not hand project tests credentials or loader hooks.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env['PATH'], HOME: scratch, TMPDIR: join(scratch, 'tmp'),
      TMP: join(scratch, 'tmp'), TEMP: join(scratch, 'tmp'), LANG: 'C.UTF-8',
      CI: 'true', NO_COLOR: '1', PROCTOR_DYNAMIC_ACTIVE: '1',
      PYTHONDONTWRITEBYTECODE: '1', PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1',
      npm_config_offline: 'true', npm_config_audit: 'false', npm_config_update_notifier: 'false',
      npm_config_cache: join(scratch, 'npm-cache'),
    };
    const remaining = timeout - (Date.now() - started);
    if (remaining <= 0) return skipped(`overall timeout (${timeout}ms)`);
    return await new Promise<DynamicResult>((resolve) => {
      const namespaceArgs = ['--die-with-parent', '--unshare-net', '--unshare-pid', '--ro-bind', '/', '/', '--bind', scratch, scratch,
        '--proc', '/proc', '--dev', '/dev', '--', process.execPath, options.workerPath, join(scratch, 'input.json')];
      // No fallback: if namespace setup fails, project code is never executed.
      const child = spawn('bwrap', namespaceArgs, {
        cwd: scratch, env, detached: true, stdio: [options.judge ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
      const kill = () => {
        controller.abort();
        if (child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); }
          catch {
            // The isolated group may already be gone; repeated cleanup must remain safe on exit and signals.
          }
        }
      };
      const onExit = () => { kill(); clean(); };
      const onInt = () => { onExit(); process.exit(130); };
      const onTerm = () => { onExit(); process.exit(143); };
      process.once('exit', onExit);
      process.once('SIGINT', onInt);
      process.once('SIGTERM', onTerm);
      let stdout = '', stderr = '', reason = '', relay = '';
      let requests = 0;
      child.stdin?.on('error', () => { /* The worker may exit before a pending optional response. */ });
      const timer = setTimeout(() => { reason = `overall timeout (${timeout}ms)`; kill(); }, remaining);
      if (ask) child.stdout!.setEncoding('utf8');
      child.stdout!.on('data', (data: Buffer) => {
        if (ask) {
          relay += data.toString();
          let end: number;
          while ((end = relay.indexOf('\n')) >= 0) {
            const line = relay.slice(0, end); relay = relay.slice(end + 1);
            try {
              const message = JSON.parse(line);
              if (message.judgeRequest && requests++ < 2) {
                void ask(message.judgeRequest).then(answer => { if (!controller.signal.aborted) child.stdin?.write(JSON.stringify(answer) + '\n'); }).catch(() => { if (!controller.signal.aborted) child.stdin?.write('null\n'); });
              } else child.stdin?.write('null\n');
            } catch { reason = 'invalid worker relay'; kill(); }
          }
          if (relay.length > 4 * 1024 * 1024) { reason = 'worker output limit'; kill(); }
        } else stdout += data.toString();
        if (stdout.length > 4 * 1024 * 1024) { reason = 'worker output limit'; kill(); }
      });
      child.stderr!.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-2000); });
      child.once('error', (err) => { reason = `cannot start isolated worker: ${err.message}`; });
      child.once('close', (code) => {
        clearTimeout(timer);
        kill(); // Also kill descendants left behind by a successful or failed test command.
        process.removeListener('exit', onExit);
        process.removeListener('SIGINT', onInt);
        process.removeListener('SIGTERM', onTerm);
        if (reason) { resolve(skipped(reason)); return; }
        if (code !== 0) { resolve(skipped(stderr.trim() || `isolated worker exited ${code}`)); return; }
        try {
          const result = JSON.parse(ask ? relay : stdout) as DynamicResult;
          result.elapsedMs = Date.now() - started;
          resolve(result);
        } catch { resolve(skipped('isolated worker returned no usable result')); }
      });
    });
  } catch (err) { return skipped(`cannot prepare isolated worker: ${String(err).replace(/^Error: /, '')}`); }
  finally { clean(); }
}
