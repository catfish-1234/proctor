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

  it('quotes the globs value so it is valid YAML, not a bare alias indicator', () => {
    // A regex/structural check alone ("globs:" is present) would have let `globs: **` ship: an
    // unquoted plain scalar starting with `*` is a YAML alias reference, not a literal string, and
    // fails to parse. Assert the actual emitted line, not just that a `globs:` key exists.
    const out = cursorMdcTransform(CANONICAL);
    const globsLine = out.split('\n').find(line => line.startsWith('globs:'));
    expect(globsLine).toBe("globs: '**'");
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

describe('AGENT_ADAPTERS roster shape (AGENT-01/AGENT-02)', () => {
  it('has exactly 30 entries, the original 10, the 8 Phase 9 additions, and the 12 Phase 10 additions', () => {
    expect(AGENT_ADAPTERS.length).toBe(30);
  });

  it('every entry has a non-empty string id, displayName, relativePath, and a boolean scriptable', () => {
    for (const adapter of AGENT_ADAPTERS) {
      expect(typeof adapter.id).toBe('string');
      expect(adapter.id.length).toBeGreaterThan(0);
      expect(typeof adapter.displayName).toBe('string');
      expect(adapter.displayName.length).toBeGreaterThan(0);
      expect(typeof adapter.relativePath).toBe('string');
      expect(adapter.relativePath.length).toBeGreaterThan(0);
      expect(typeof adapter.scriptable).toBe('boolean');
    }
  });

  it('every relativePath is unique across the roster', () => {
    const paths = AGENT_ADAPTERS.map((a) => a.relativePath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every id is unique across the roster', () => {
    const ids = AGENT_ADAPTERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the 7 new verbatim researched adapters with their verified paths and scriptability', () => {
    const expected: Array<{ id: string; relativePath: string; scriptable: boolean }> = [
      { id: 'zed', relativePath: '.rules', scriptable: false },
      { id: 'agents-md', relativePath: 'AGENTS.md', scriptable: false },
      { id: 'openhands', relativePath: '.openhands/microagents/repo.md', scriptable: true },
      { id: 'kiro', relativePath: '.kiro/steering/proctor.md', scriptable: true },
      { id: 'tabnine', relativePath: '.tabnine/guidelines/proctor.md', scriptable: true },
      { id: 'trae', relativePath: '.trae/rules/proctor.md', scriptable: false },
      { id: 'github-copilot-global', relativePath: '.github/copilot-instructions.md', scriptable: false },
    ];
    for (const exp of expected) {
      const adapter = AGENT_ADAPTERS.find((a) => a.id === exp.id);
      expect(adapter, `expected adapter id ${exp.id} to exist`).toBeDefined();
      expect(adapter?.relativePath).toBe(exp.relativePath);
      expect(adapter?.scriptable).toBe(exp.scriptable);
    }
  });

  it('does not modify the existing locked codex or amazon-q entries', () => {
    const codex = AGENT_ADAPTERS.find((a) => a.id === 'codex');
    expect(codex?.relativePath).toBe('.agents/skills/proctor/SKILL.md');
    expect(codex?.scriptable).toBe(true);

    const amazonQ = AGENT_ADAPTERS.find((a) => a.id === 'amazon-q');
    expect(amazonQ?.relativePath).toBe('.amazonq/rules/proctor.md');
    expect(amazonQ?.scriptable).toBe(false);
  });

  it('github-copilot-global is distinct from the existing github-copilot (path-scoped) entry', () => {
    const global = AGENT_ADAPTERS.find((a) => a.id === 'github-copilot-global');
    const scoped = AGENT_ADAPTERS.find((a) => a.id === 'github-copilot');
    expect(global?.relativePath).toBe('.github/copilot-instructions.md');
    expect(scoped?.relativePath).toBe('.github/instructions/proctor.instructions.md');
    expect(global?.relativePath).not.toBe(scoped?.relativePath);
  });

  it('the qodo entry has the researched path, scriptable true, and merges as a shared file', () => {
    const qodo = AGENT_ADAPTERS.find((a) => a.id === 'qodo');
    expect(qodo).toBeDefined();
    expect(qodo?.relativePath).toBe('best_practices.md');
    expect(qodo?.scriptable).toBe(true);
    expect(qodo?.shared).toBe(true);
  });

  it('includes the 12 Phase 10 adapters with their verified paths and scriptability', () => {
    const expected: Array<{ id: string; relativePath: string; scriptable: boolean; shared: boolean }> = [
      { id: 'roo-code', relativePath: '.roo/rules/proctor.md', scriptable: false, shared: false },
      { id: 'kilo-code', relativePath: '.kilocode/rules/proctor.md', scriptable: true, shared: false },
      { id: 'augment', relativePath: '.augment/rules/proctor.md', scriptable: true, shared: false },
      { id: 'antigravity', relativePath: '.agents/rules/proctor.md', scriptable: false, shared: false },
      { id: 'goose', relativePath: '.goosehints', scriptable: true, shared: true },
      { id: 'junie', relativePath: '.junie/guidelines.md', scriptable: true, shared: true },
      { id: 'qwen-code', relativePath: 'QWEN.md', scriptable: true, shared: true },
      { id: 'crush', relativePath: 'CRUSH.md', scriptable: true, shared: true },
      { id: 'warp', relativePath: 'WARP.md', scriptable: false, shared: true },
      { id: 'amp', relativePath: 'AGENT.md', scriptable: true, shared: true },
      { id: 'firebase-studio', relativePath: '.idx/airules.md', scriptable: false, shared: true },
      { id: 'replit', relativePath: 'replit.md', scriptable: false, shared: true },
    ];
    for (const exp of expected) {
      const adapter = AGENT_ADAPTERS.find((a) => a.id === exp.id);
      expect(adapter?.id, `expected adapter id ${exp.id} to exist`).toBe(exp.id);
      expect(adapter?.relativePath).toBe(exp.relativePath);
      expect(adapter?.scriptable).toBe(exp.scriptable);
      expect(adapter?.shared === true).toBe(exp.shared);
    }
  });

  it("Amp's AGENT.md is a different file from the universal AGENTS.md", () => {
    const amp = AGENT_ADAPTERS.find((a) => a.id === 'amp');
    const universal = AGENT_ADAPTERS.find((a) => a.id === 'agents-md');
    expect(amp?.relativePath).toBe('AGENT.md');
    expect(universal?.relativePath).toBe('AGENTS.md');
  });

  it("Antigravity's .agents/rules/ does not collide with the codex .agents/skills/ entry", () => {
    const antigravity = AGENT_ADAPTERS.find((a) => a.id === 'antigravity');
    const codex = AGENT_ADAPTERS.find((a) => a.id === 'codex');
    expect(antigravity?.relativePath).toBe('.agents/rules/proctor.md');
    expect(codex?.relativePath).toBe('.agents/skills/proctor/SKILL.md');
  });

  it('no adapter is both shared and transformed, a merged block cannot carry file-level frontmatter', () => {
    for (const adapter of AGENT_ADAPTERS) {
      expect(
        adapter.shared === true && adapter.transform !== undefined,
        `adapter ${adapter.id} must not set both shared and transform`
      ).toBe(false);
    }
  });

  it('every proctor-owned (non-shared) path is namespaced to proctor, so it can never clobber a user file', () => {
    for (const adapter of AGENT_ADAPTERS) {
      if (adapter.shared) continue;
      expect(
        adapter.relativePath.toLowerCase().includes('proctor'),
        `adapter ${adapter.id} owns ${adapter.relativePath} but is not proctor-namespaced; it should be shared: true`
      ).toBe(true);
    }
  });
});
