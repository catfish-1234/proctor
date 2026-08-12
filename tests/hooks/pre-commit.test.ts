import { describe, it, expect } from 'vitest';
import { preCommitHookContent } from '../../src/hooks/pre-commit.js';

describe('preCommitHookContent', () => {
  const content = preCommitHookContent();

  it('is a shell script that runs proctor check --staged', () => {
    expect(content).toMatch(/^#!\/bin\/sh/);
    expect(content).toContain('check --staged');
  });

  it('is deterministic, identical output on repeated calls', () => {
    expect(preCommitHookContent()).toBe(preCommitHookContent());
  });

  it('prefers a local install over the network', () => {
    // A commit that depends on a registry round-trip is a commit that fails on a plane.
    const localIndex = content.indexOf('node_modules/.bin/proctor');
    const npxIndex = content.indexOf('npx');
    expect(localIndex).toBeGreaterThan(-1);
    expect(npxIndex).toBeGreaterThan(-1);
    expect(localIndex).toBeLessThan(npxIndex);
  });

  it('fails closed when proctor cannot run at all', () => {
    // The original hook ran `npx <pkg> check --staged` and mapped exit 1 to "allow", because 1 is
    // proctor's warning-only code. npx also exits 1 when it cannot resolve the package, so an
    // unreachable registry looked exactly like a clean run and the commit landed unchecked. The
    // probe is what separates the two.
    expect(content).toContain('--version');
    expect(content).toMatch(/if ! proctor_run --version/);
    expect(content).toMatch(/NOT checked/);
  });

  it('still lets warning-only findings through, and blocks on errors', () => {
    expect(content).toContain('if [ "$status" -eq 1 ]; then exit 0; fi');
    expect(content).toContain('exit $status');
  });

  it('tells the reader how to proceed rather than only refusing', () => {
    expect(content).toContain('--no-verify');
    expect(content).toMatch(/npm install/);
  });
});
