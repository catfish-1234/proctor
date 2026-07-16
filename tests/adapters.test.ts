import { describe, it, expect } from 'vitest';
import { cursorMdcTransform, copilotApplyToTransform, AGENT_ADAPTERS } from '../src/adapters/registry.js';

const CANONICAL = 'canonical body line one\nRH001 lives here\nline three\n';

describe('cursorMdcTransform', () => {
  it('produces a .mdc frontmatter block with description, globs, and alwaysApply: true', () => {
    const out = cursorMdcTransform(CANONICAL);
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toMatch(/description:/);
    expect(out).toMatch(/globs:/);
    expect(out).toMatch(/alwaysApply:\s*true/);
  });

  it('passes the canonical body through byte-for-byte, exactly once, as a trailing block', () => {
    const out = cursorMdcTransform(CANONICAL);
    // Canonical string appears exactly once, verbatim.
    const firstIndex = out.indexOf(CANONICAL);
    expect(firstIndex).toBeGreaterThan(-1);
    expect(out.indexOf(CANONICAL, firstIndex + 1)).toBe(-1);
    // Frontmatter precedes a blank line, then the canonical content.
    const frontmatterEnd = out.indexOf('---\n\n');
    expect(frontmatterEnd).toBeGreaterThanOrEqual(0);
    expect(out.endsWith(CANONICAL)).toBe(true);
  });

  it('is pure: identical input yields identical output across calls', () => {
    expect(cursorMdcTransform(CANONICAL)).toBe(cursorMdcTransform(CANONICAL));
  });
});

describe('copilotApplyToTransform', () => {
  it('produces a frontmatter block with applyTo set to a glob matching all files', () => {
    const out = copilotApplyToTransform(CANONICAL);
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toMatch(/applyTo:\s*'\*\*'/);
  });

  it('passes the canonical body through byte-for-byte, exactly once, as a trailing block', () => {
    const out = copilotApplyToTransform(CANONICAL);
    const firstIndex = out.indexOf(CANONICAL);
    expect(firstIndex).toBeGreaterThan(-1);
    expect(out.indexOf(CANONICAL, firstIndex + 1)).toBe(-1);
    expect(out.endsWith(CANONICAL)).toBe(true);
  });

  it('is pure: identical input yields identical output across calls', () => {
    expect(copilotApplyToTransform(CANONICAL)).toBe(copilotApplyToTransform(CANONICAL));
  });
});

describe('registry wiring', () => {
  it('attaches cursorMdcTransform to the cursor entry without changing its id or relativePath', () => {
    const cursor = AGENT_ADAPTERS.find((a) => a.id === 'cursor');
    expect(cursor).toBeDefined();
    expect(cursor?.relativePath).toBe('.cursor/rules/proctor.mdc');
    expect(cursor?.transform).toBe(cursorMdcTransform);
  });

  it('attaches copilotApplyToTransform to the github-copilot entry without changing its id or relativePath', () => {
    const copilot = AGENT_ADAPTERS.find((a) => a.id === 'github-copilot');
    expect(copilot).toBeDefined();
    expect(copilot?.relativePath).toBe('.github/instructions/proctor.instructions.md');
    expect(copilot?.transform).toBe(copilotApplyToTransform);
  });
});
