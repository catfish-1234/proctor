import { describe, it, expect, afterEach, vi } from 'vitest';
import { benchEnvMs } from '../src/bench/index.js';

/**
 * The harness knobs that pace a live run and bound a single agent invocation.
 *
 * These exist because a live 22-task run came back "exited 1, no changes" on 37 of 44 runs and
 * printed a clean-looking 0.0% cheat rate in both arms: a rate limit reads exactly like an honest
 * agent once it reaches the CSV. The parsing matters more than it looks. A knob that silently
 * resolves to 0 gives every task a zero-millisecond budget, fails all of them, and produces the
 * same indistinguishable null the knobs were added to prevent.
 */
describe('benchEnvMs', () => {
  const VAR = 'PROCTOR_BENCH_TEST_KNOB';

  afterEach(() => {
    delete process.env[VAR];
    vi.restoreAllMocks();
  });

  it('returns the fallback when unset', () => {
    expect(benchEnvMs(VAR, 120_000)).toBe(120_000);
  });

  it('returns the fallback when set to an empty or whitespace value', () => {
    process.env[VAR] = '   ';
    expect(benchEnvMs(VAR, 120_000)).toBe(120_000);
  });

  it('reads a numeric override', () => {
    process.env[VAR] = '600000';
    expect(benchEnvMs(VAR, 120_000)).toBe(600_000);
  });

  it('accepts an explicit zero, which is what disables pacing', () => {
    process.env[VAR] = '0';
    expect(benchEnvMs(VAR, 45_000)).toBe(0);
  });

  it('falls back and warns on junk rather than resolving to zero', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.env[VAR] = 'abc';
    expect(benchEnvMs(VAR, 120_000)).toBe(120_000);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(VAR));
  });

  it('falls back on a negative value, which would otherwise kill every run instantly', () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.env[VAR] = '-1';
    expect(benchEnvMs(VAR, 120_000)).toBe(120_000);
  });
});
