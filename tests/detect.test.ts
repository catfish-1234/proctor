import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAgents, selectAgents, FALLBACK_ADAPTER_ID } from '../src/adapters/detect.js';
import { AGENT_ADAPTERS } from '../src/adapters/registry.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'proctor-detect-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('detectAgents', () => {
  it('falls back to AGENTS.md alone in a repo with no agent config at all', async () => {
    const found = await detectAgents(dir);
    expect(found.map(a => a.id)).toEqual([FALLBACK_ADAPTER_ID]);
  });

  it('detects only the agents whose own config directory is present', async () => {
    await mkdir(join(dir, '.cursor'), { recursive: true });
    await mkdir(join(dir, '.claude'), { recursive: true });
    const ids = (await detectAgents(dir)).map(a => a.id);
    expect(ids).toContain('cursor');
    expect(ids).toContain('claude-code');
    // The whole point: an unrelated agent must not be installed into this repo.
    expect(ids).not.toContain('replit');
    expect(ids).not.toContain('warp');
    expect(ids.length).toBe(2);
  });

  it('detects an agent from the shared instructions file it already owns', async () => {
    await writeFile(join(dir, 'WARP.md'), '# my warp rules\n', 'utf8');
    const ids = (await detectAgents(dir)).map(a => a.id);
    expect(ids).toEqual(['warp']);
  });

  it('is idempotent: re-detecting after an install still finds the same agents', async () => {
    await mkdir(join(dir, '.cursor'), { recursive: true });
    const first = (await detectAgents(dir)).map(a => a.id);
    // Simulate what install writes, then re-detect.
    await mkdir(join(dir, '.cursor', 'rules'), { recursive: true });
    await writeFile(join(dir, '.cursor', 'rules', 'proctor.mdc'), 'ruleset\n', 'utf8');
    expect((await detectAgents(dir)).map(a => a.id)).toEqual(first);
  });

  it('does not treat a bare .github directory as GitHub Copilot', async () => {
    // Nearly every repo has .github/workflows; that is not a signal that Copilot is in use.
    await mkdir(join(dir, '.github', 'workflows'), { recursive: true });
    const ids = (await detectAgents(dir)).map(a => a.id);
    expect(ids).not.toContain('github-copilot');
    expect(ids).not.toContain('github-copilot-global');
  });

  it('detects Copilot from its real instructions paths', async () => {
    await mkdir(join(dir, '.github', 'instructions'), { recursive: true });
    const ids = (await detectAgents(dir)).map(a => a.id);
    expect(ids).toContain('github-copilot');
  });

  it("does not confuse Codex's .agents/skills with Antigravity's .agents/rules", async () => {
    await mkdir(join(dir, '.agents', 'skills'), { recursive: true });
    const ids = (await detectAgents(dir)).map(a => a.id);
    expect(ids).toContain('codex');
    expect(ids).not.toContain('antigravity');
  });

  it('returns adapters in roster order', async () => {
    await mkdir(join(dir, '.trae'), { recursive: true });
    await mkdir(join(dir, '.claude'), { recursive: true });
    const ids = (await detectAgents(dir)).map(a => a.id);
    const rosterOrder = AGENT_ADAPTERS.map(a => a.id);
    expect(ids).toEqual([...ids].sort((a, b) => rosterOrder.indexOf(a) - rosterOrder.indexOf(b)));
  });
});

describe('selectAgents', () => {
  it('resolves known ids to their adapters in roster order', () => {
    const { selected, unknown } = selectAgents(['cursor', 'claude-code']);
    expect(unknown).toEqual([]);
    expect(selected.map(a => a.id)).toEqual(['claude-code', 'cursor']);
  });

  it('reports unknown ids rather than silently installing fewer agents than asked for', () => {
    const { selected, unknown } = selectAgents(['cursor', 'not-an-agent']);
    expect(unknown).toEqual(['not-an-agent']);
    expect(selected.map(a => a.id)).toEqual(['cursor']);
  });
});

describe('registry detect markers', () => {
  it('every detect marker is a non-empty string, and never bare .github', () => {
    for (const adapter of AGENT_ADAPTERS) {
      if (adapter.detect === undefined) continue;
      expect(adapter.detect.length).toBeGreaterThan(0);
      for (const marker of adapter.detect) {
        expect(typeof marker).toBe('string');
        expect(marker.trim()).not.toBe('');
        expect(marker).not.toBe('.github');
      }
    }
  });

  it('the AGENTS.md fallback adapter exists in the roster', () => {
    expect(AGENT_ADAPTERS.some(a => a.id === FALLBACK_ADAPTER_ID)).toBe(true);
  });
});
