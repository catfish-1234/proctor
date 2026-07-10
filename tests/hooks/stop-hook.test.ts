import { describe, it, expect } from 'vitest';
import { parseStopHookInput } from '../../src/hooks/stop-hook.js';

describe('parseStopHookInput', () => {
  it('uses the input cwd when present', () => {
    const result = parseStopHookInput(JSON.stringify({ cwd: '/repo' }), '/fallback');
    expect(result).toEqual({ cwd: '/repo', skip: false });
  });

  it('falls back to the provided cwd when input cwd is missing', () => {
    const result = parseStopHookInput(JSON.stringify({}), '/fallback');
    expect(result).toEqual({ cwd: '/fallback', skip: false });
  });

  it('falls back to the provided cwd on invalid JSON', () => {
    const result = parseStopHookInput('not-json', '/fallback');
    expect(result).toEqual({ cwd: '/fallback', skip: false });
  });

  it('signals skip when stop_hook_active is true (prevents infinite loop)', () => {
    const result = parseStopHookInput(JSON.stringify({ cwd: '/repo', stop_hook_active: true }), '/fallback');
    expect(result.skip).toBe(true);
  });

  it('ignores an empty-string cwd and falls back', () => {
    const result = parseStopHookInput(JSON.stringify({ cwd: '' }), '/fallback');
    expect(result.cwd).toBe('/fallback');
  });
});
