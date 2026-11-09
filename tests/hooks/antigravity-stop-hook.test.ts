import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS, decideBlockBudget, formatStopHookResult, parseStopHookInput,
} from '../../src/hooks/stop-hook.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

// Shape documented at https://antigravity.google/docs/hooks and observed live on agy 1.5.3.
const stopPayload = (workspace: string, executionNum = 0, conversationId = 'dd3ff231-0000-4000-8000-000000000001') => ({
  executionNum, terminationReason: 'NO_TOOL_CALL', error: '', fullyIdle: true, conversationId,
  workspacePaths: [workspace], transcriptPath: '/home/u/.gemini/antigravity-cli/brain/x/transcript_full.jsonl',
  artifactDirectoryPath: '/home/u/.gemini/antigravity-cli/brain/x', modelName: 'gemini-3.8-flash-high',
  lastUserInput: 'Fix the failing test',
});

describe('Antigravity Stop protocol', () => {
  it('takes the repo from workspacePaths[0] and never skips on executionNum', () => {
    expect(parseStopHookInput(JSON.stringify(stopPayload('/proj')), '/fallback', 'antigravity'))
      .toMatchObject({ cwd: '/proj', skip: false, executionNum: 0 });
    // A retry count is not proof the tree is clean: later Stops are still checked.
    expect(parseStopHookInput(JSON.stringify(stopPayload('/proj', 3)), '/fallback', 'antigravity'))
      .toMatchObject({ cwd: '/proj', skip: false, executionNum: 3 });
  });

  it('ignores a stop_hook_active flag, which Antigravity does not send, instead of trusting it', () => {
    const input = { ...stopPayload('/proj', 1), stop_hook_active: true };
    expect(parseStopHookInput(JSON.stringify(input), '/fallback', 'antigravity').skip).toBe(false);
  });

  it('falls back to the process cwd without workspacePaths', () => {
    const input = { ...stopPayload('/proj'), workspacePaths: [] };
    expect(parseStopHookInput(JSON.stringify(input), '/fallback', 'antigravity').cwd).toBe('/fallback');
  });

  it.each(['not-json', '', 'null', '[]', '"text"', '42'])('silently skips malformed input: %s', raw => {
    expect(parseStopHookInput(raw, '/repo', 'antigravity').skip).toBe(true);
  });

  it('maps a block to exactly a block decision with the full finding, exit 0', () => {
    const reason = '[RH001] deleted "a test"\n';
    const result = formatStopHookResult({ exitCode: 2, output: reason }, 'antigravity');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ decision: 'block', reason });
  });

  it('is silent when allowing', () => {
    expect(formatStopHookResult({ exitCode: 0, output: 'diagnostic' }, 'antigravity')).toEqual({ exitCode: 0, output: '' });
  });
});

describe('decideBlockBudget', () => {
  it('blocks until the cap, then fails open and says so', () => {
    let state = undefined as { blocks: number } | undefined;
    for (let n = 0; n < ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS; n++) {
      const d = decideBlockBudget(state, n);
      expect(d).toMatchObject({ block: true, exhausted: false });
      state = d.next;
    }
    expect(decideBlockBudget(state, ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS)).toMatchObject({ block: false, exhausted: true });
  });

  it('a new user turn (executionNum 0) starts a fresh budget', () => {
    const spent = { blocks: ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS };
    expect(decideBlockBudget(spent, 0)).toMatchObject({ block: true, next: { blocks: 1 } });
  });
});

describe('stop-hook --format antigravity CLI', () => {
  let dir: string;
  let tmp: string;
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  const hook = (executionNum: number, conversationId = 'conv-a') => spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'antigravity'], {
    cwd: dir, input: JSON.stringify(stopPayload(dir, executionNum, conversationId)), encoding: 'utf8', env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
  });
  const seed = "it('a', () => { expect(1).toBe(1); });\nit('b', () => { expect(2).toBe(2); });\n";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'proctor-agy-stop-'));
    tmp = mkdtempSync(join(tmpdir(), 'proctor-agy-tmp-'));
    git('init');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'a.test.ts'), seed);
    git('add', '.');
    git('commit', '-m', 'seed');
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); });

  const cheat = () => writeFileSync(join(dir, 'a.test.ts'), "it('a', () => { expect(1).toBe(1); });\n");

  it('blocks a deleted test with a block decision', () => {
    cheat();
    const r = hook(0);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).decision).toBe('block');
    expect(JSON.parse(r.stdout).reason).toContain('RH001');
  });

  it('is silent on a clean tree and for malformed stdin', () => {
    expect(hook(0)).toMatchObject({ status: 0, stdout: '' });
    const bad = spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'antigravity'], { cwd: dir, input: 'nope', encoding: 'utf8' });
    expect(bad).toMatchObject({ status: 0, stdout: '' });
  });

  it('blocks again when the agent ends the turn with the cheat unchanged after a block', () => {
    cheat();
    expect(JSON.parse(hook(0).stdout).decision).toBe('block');
    // Retry with the tree untouched: executionNum is 1 but the finding is still there.
    expect(JSON.parse(hook(1).stdout).decision).toBe('block');
    expect(JSON.parse(hook(2).stdout).decision).toBe('block');
  });

  it('allows the honest fix after a block and resets the budget', () => {
    cheat();
    expect(JSON.parse(hook(0).stdout).decision).toBe('block');
    writeFileSync(join(dir, 'a.test.ts'), seed);
    expect(hook(1)).toMatchObject({ status: 0, stdout: '' });
    cheat();
    // Budget restarted: the full allowance is available again, not the leftover count.
    for (let n = 0; n < ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS; n++) expect(JSON.parse(hook(n + 1).stdout).decision).toBe('block');
  });

  it('fails open only after the cap, reports it, and a fresh turn blocks again', () => {
    cheat();
    for (let n = 0; n < ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS; n++) expect(JSON.parse(hook(n).stdout).decision).toBe('block');
    const spent = hook(ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS);
    expect(spent).toMatchObject({ status: 0, stdout: '' });
    expect(spent.stderr).toContain('block budget exhausted');
    expect(JSON.parse(hook(0).stdout).decision).toBe('block');
  });

  it('still blocks when the agent also edits proctor.config.json to relax the rule', () => {
    cheat();
    writeFileSync(join(dir, 'proctor.config.json'), JSON.stringify({ rules: { RH001: 'off' } }));
    const r = hook(0);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toBe('');
  });

  it('keeps counters per conversation and never writes into the repo', () => {
    cheat();
    for (let n = 0; n < ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS; n++) hook(n, 'conv-a');
    expect(hook(ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS, 'conv-a').stdout).toBe('');
    expect(JSON.parse(hook(1, 'conv-b').stdout).decision).toBe('block');
    expect(existsSync(join(dir, '.proctor'))).toBe(false);
  });
});
