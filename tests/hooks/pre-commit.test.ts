import { describe, it, expect } from 'vitest';
import { preCommitHookContent } from '../../src/hooks/pre-commit.js';

describe('preCommitHookContent', () => {
  it('is a shell script that runs proctor check --staged', () => {
    const content = preCommitHookContent();
    expect(content).toMatch(/^#!\/bin\/sh/);
    expect(content).toContain('proctor check --staged');
  });

  it('is deterministic — identical output on repeated calls', () => {
    expect(preCommitHookContent()).toBe(preCommitHookContent());
  });
});
