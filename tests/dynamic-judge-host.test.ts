import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { createJudge, detectJudge, judgeCommand, unwrapJudge } from '../src/dynamic/judge.js';
import { JUDGE_CALL_LIMIT, JUDGE_PROMPT_BYTES, judgePrompt, parseJudgeVerdict, type JudgeRequest } from '../src/dynamic/judge-protocol.js';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
const request: JudgeRequest = { name: 'compute', arity: 1, before: 'x=>x', after: 'x=>x.slice(0,1)', sentences: ['`app.compute(x)` keeps every character.'] };
const yes = { violation: 'yes', quote: request.sentences[0], claim: { kind: 'width' } };
const json = JSON.stringify(yes);
let root: string, bin: string, work: string, repo: string;
function fake(name: string) { const path = join(bin, name); writeFileSync(path, 'fake executable'); chmodSync(path, 0o755); }
function output(stdout: string, code = 0, delay = 0) {
  const child = new EventEmitter() as any;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  setTimeout(() => { child.stdout.write(stdout); child.emit('close', code); }, delay);
  return child;
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'proctor-judge-host-')); bin = join(root, 'bin'); work = join(root, 'work'); repo = join(root, 'repo');
  for (const dir of [bin, work, repo]) mkdirSync(dir);
  vi.stubEnv('PATH', bin); vi.mocked(spawn).mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
const judge = (deadline = Date.now() + 1000, signal = new AbortController().signal) => createJudge(repo, work, deadline, signal, 'gemini');
describe('local judge budget and parsing', () => {
  it('caps the entire UTF-8 prompt conservatively below 2000 tokens', () => {
    expect(JUDGE_PROMPT_BYTES).toBe(2000);
    expect(Buffer.byteLength(judgePrompt(request)!)).toBeLessThanOrEqual(2000);
    expect(judgePrompt({ ...request, before: 'a'.repeat(2000) })).toBeUndefined();
    expect(judgePrompt({ ...request, before: '😀'.repeat(500) })).toBeUndefined();
    expect(judgePrompt({ ...request, sentences: Array(5).fill('x') })).toBeUndefined();
  });
  it('requires strict quoted JSON with a supported data-only claim', () => {
    expect(parseJudgeVerdict(json, request)).toEqual(yes);
    for (const bad of [json + ' trailing', '```json\n' + json + '\n```', JSON.stringify({ ...yes, quote: 'invented' }),
      JSON.stringify({ ...yes, claim: { kind: 'eval', code: 'false' } }), JSON.stringify({ ...yes, extra: true }),
      JSON.stringify({ ...yes, claim: { kind: 'width', expected: 5 } }), JSON.stringify({ ...yes, claim: { kind: 'example', args: [2] } }),
      JSON.stringify({ ...yes, claim: { kind: 'width', args: [{ unsafe: true }] } }), JSON.stringify({ ...yes, claim: { kind: 'pad' } })]) {
      expect(parseJudgeVerdict(bad, request)).toBeUndefined();
    }
    expect(parseJudgeVerdict(JSON.stringify({ violation: 'unclear', quote: '', claim: null }), request)?.violation).toBe('unclear');
  });
  it('accepts literal example data and rejects oversized or nonfinite claims', () => {
    expect(parseJudgeVerdict(JSON.stringify({ ...yes, claim: { kind: 'example', args: [true], expected: null } }), request)?.claim).toEqual({ kind: 'example', args: [true], expected: null });
    expect(parseJudgeVerdict(JSON.stringify({ ...yes, claim: { kind: 'example', args: [Array(13).fill(1)], expected: 1 } }), request)).toBeUndefined();
    expect(parseJudgeVerdict('{"violation":"yes","quote":"' + request.sentences[0] + '","claim":{"kind":"example","args":[1e999],"expected":1}}', request)).toBeUndefined();
  });
  it('unwraps supported command envelopes without accepting error envelopes', () => {
    expect(unwrapJudge('gemini', JSON.stringify({ response: json }))).toBe(json);
    expect(unwrapJudge('claude', JSON.stringify({ result: json }))).toBe(json);
    expect(unwrapJudge('codex', json)).toBe(json);
    expect(unwrapJudge('claude', JSON.stringify({ result: json, is_error: true }))).toBeUndefined();
    expect(unwrapJudge('gemini', 'Please sign in')).toBeUndefined();
  });
  it('uses each CLI default model and noninteractive documented entry point', () => {
    expect(judgeCommand('claude', 'prompt')).toEqual(['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands']);
    expect(judgeCommand('codex', 'prompt')).toContain('read-only');
    expect(judgeCommand('gemini', 'prompt')).toEqual(['--prompt', 'prompt', '--output-format', 'json']);
    for (const cli of ['claude', 'codex', 'gemini'] as const) expect(judgeCommand(cli, 'prompt')).not.toContain('--model');
  });
  it('prefers other commands when the paid-route key exists and honors explicit selection', () => {
    for (const name of ['claude', 'codex', 'gemini']) fake(name);
    const env = { PATH: bin, ANTHROPIC_API_KEY: 'test-key' };
    expect(detectJudge(repo, undefined, env)?.cli).toBe('gemini');
    expect(detectJudge(repo, 'claude', env)?.cli).toBe('claude');
    expect(detectJudge(repo, undefined, { PATH: repo + delimiter + '.', ANTHROPIC_API_KEY: 'test-key' })).toBeUndefined();
    const nested = join(repo, '..bin'); mkdirSync(nested); writeFileSync(join(nested, 'gemini'), 'fake'); chmodSync(join(nested, 'gemini'), 0o755);
    expect(detectJudge(repo, 'gemini', { PATH: nested })).toBeUndefined();
  });
  it('silently avoids missing binaries and oversized prompts', async () => {
    expect(await judge()(request)).toBeNull();
    fake('gemini');
    expect(await judge()({ ...request, before: 'x'.repeat(3000) })).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });
  it('enforces two attempts across distinct uncached prompts', async () => {
    fake('gemini'); vi.mocked(spawn).mockImplementation(() => output(JSON.stringify({ response: json })));
    const ask = judge();
    for (let i = 0; i < 4; i++) await ask({ ...request, before: `x=>x+${i}` });
    expect(spawn).toHaveBeenCalledTimes(JUDGE_CALL_LIMIT);
  });
  it('persists content hashes and reuses both positive and negative verdicts without calls', async () => {
    fake('gemini'); vi.mocked(spawn).mockImplementation(() => output(JSON.stringify({ response: json })));
    expect((await judge()(request))?.cached).toBe(false);
    const cache = readFileSync(join(repo, '.proctor-judge-cache'), 'utf8');
    expect(cache).not.toContain(request.before);
    expect((await judge()(request))?.cached).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    vi.mocked(spawn).mockImplementation(() => output(JSON.stringify({ response: JSON.stringify({ violation: 'no', quote: '', claim: null }) })));
    const second = { ...request, after: 'x=>String(x)' };
    expect((await judge()(second))?.verdict.violation).toBe('no');
    expect((await judge()(second))?.cached).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
  });
  it('invalidates changed documentation and source and ignores corrupt caches', async () => {
    fake('gemini'); writeFileSync(join(repo, '.proctor-judge-cache'), 'corrupt');
    vi.mocked(spawn).mockImplementation(() => output(JSON.stringify({ response: JSON.stringify({ violation: 'no', quote: '', claim: null }) })));
    await judge()(request); await judge()({ ...request, after: 'x=>x+x' }); await judge()({ ...request, sentences: ['Changed wording.'] });
    expect(spawn).toHaveBeenCalledTimes(3);
  });
  it('does not cache malformed, unsigned-in, failed or timed-out output', async () => {
    fake('gemini');
    for (const [text, code, delay] of [['bad', 0, 0], [JSON.stringify({ response: json }), 1, 0], [JSON.stringify({ response: json }), 0, 30]] as const) {
      vi.mocked(spawn).mockImplementation(() => output(text, code, delay));
      expect(await judge(Date.now() + 10)(request)).toBeNull();
    }
    expect(existsSync(join(repo, '.proctor-judge-cache'))).toBe(false);
  });
  it('does not invoke a CLI after cancellation or the overall deadline', async () => {
    fake('gemini'); const controller = new AbortController(); controller.abort();
    expect(await judge(Date.now() + 1000, controller.signal)(request)).toBeNull();
    expect(await judge(Date.now() - 1)(request)).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });
  it('confines the CLI to a separate empty work directory with a read-only host', async () => {
    fake('gemini'); vi.mocked(spawn).mockImplementation(() => output(JSON.stringify({ response: json })));
    await judge()(request);
    const [binary, args, options] = vi.mocked(spawn).mock.calls[0]!;
    expect(binary).toBe('bwrap'); expect(args).toContain('--ro-bind'); expect(args).not.toContain('--unshare-net');
    expect(options).toMatchObject({ cwd: work, detached: true });
  });
  it.skipIf(process.platform === 'win32')('does not replace a cache symlink', async () => {
    fake('gemini'); const target = join(root, 'target'); writeFileSync(target, 'untouched'); symlinkSync(target, join(repo, '.proctor-judge-cache'));
    vi.mocked(spawn).mockImplementation(() => output(JSON.stringify({ response: json })));
    await judge()(request); expect(readFileSync(target, 'utf8')).toBe('untouched');
  });
});
