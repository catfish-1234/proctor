import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { checkAdapterDrift } from '../src/adapters/drift-check.js';
import { AGENT_ADAPTERS, type AgentAdapter } from '../src/adapters/registry.js';
import { recordWritten } from '../src/adapters/manifest.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

describe('checkAdapterDrift (unit)', () => {
  it('flags only the adapter whose deployed content diverges from canonical', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'canonical content\n';
      const [matching, mutated] = AGENT_ADAPTERS;
      const matchingPath = join(tmpDir, matching.relativePath);
      const mutatedPath = join(tmpDir, mutated.relativePath);
      mkdirSync(dirname(matchingPath), { recursive: true });
      mkdirSync(dirname(mutatedPath), { recursive: true });
      writeFileSync(matchingPath, canonical, 'utf8');
      writeFileSync(mutatedPath, canonical + 'extra byte', 'utf8');

      const { drifted } = await checkAdapterDrift(tmpDir, canonical);

      expect(drifted).toContain(mutatedPath);
      expect(drifted).not.toContain(matchingPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not count a CRLF-only difference as drift (Windows autocrlf checkout)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'line one\nline two\n';
      const [adapter] = AGENT_ADAPTERS;
      const adapterPath = join(tmpDir, adapter.relativePath);
      mkdirSync(dirname(adapterPath), { recursive: true });
      writeFileSync(adapterPath, canonical.replace(/\n/g, '\r\n'), 'utf8');

      const { drifted, checked } = await checkAdapterDrift(tmpDir, canonical);

      expect(drifted).toEqual([]);
      expect(checked).toContain(adapterPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not count a never-installed (absent) adapter as drifted', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'canonical content\n';
      const { drifted, checked } = await checkAdapterDrift(tmpDir, canonical);
      expect(drifted).toEqual([]);
      expect(checked).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports NOT drifted when a transform-bearing adapter holds transform(canonical), and DRIFTED when it holds raw canonical instead (Pitfall 2 fix)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'canonical content\n';
      const transform = (c: string): string => `---\nframe: true\n---\n\n${c}`;
      const transformedAdapter: AgentAdapter = {
        id: 'fake-transform',
        displayName: 'Fake Transform Adapter',
        relativePath: 'fake/proctor.md',
        scriptable: false,
        transform,
      };
      const adapterPath = join(tmpDir, transformedAdapter.relativePath);
      mkdirSync(dirname(adapterPath), { recursive: true });

      // Deployed content equals transform(canonical) -> not drifted.
      writeFileSync(adapterPath, transform(canonical), 'utf8');
      const notDrifted = await checkAdapterDrift(tmpDir, canonical, [transformedAdapter]);
      expect(notDrifted.drifted).toEqual([]);
      expect(notDrifted.checked).toContain(adapterPath);

      // Deployed content equals raw canonical (transform not applied) -> drifted.
      writeFileSync(adapterPath, canonical, 'utf8');
      const drifted = await checkAdapterDrift(tmpDir, canonical, [transformedAdapter]);
      expect(drifted.drifted).toContain(adapterPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('a no-transform adapter is unaffected by the per-adapter refactor: byte-equal copy not drifted, mutated copy drifted', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'canonical content\n';
      const [adapter] = AGENT_ADAPTERS;
      const adapterPath = join(tmpDir, adapter.relativePath);
      mkdirSync(dirname(adapterPath), { recursive: true });

      writeFileSync(adapterPath, canonical, 'utf8');
      const notDrifted = await checkAdapterDrift(tmpDir, canonical, [adapter]);
      expect(notDrifted.drifted).toEqual([]);

      writeFileSync(adapterPath, canonical + 'extra byte', 'utf8');
      const drifted = await checkAdapterDrift(tmpDir, canonical, [adapter]);
      expect(drifted.drifted).toContain(adapterPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('guardExisting adapter with divergent content and NO manifest record is not flagged (never proctors, collision guard case)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'canonical content\n';
      const guarded: AgentAdapter = {
        id: 'fake-guarded', displayName: 'Fake Guarded', relativePath: 'guarded.md', scriptable: false, guardExisting: true,
      };
      const adapterPath = join(tmpDir, guarded.relativePath);
      writeFileSync(adapterPath, 'unrelated pre-existing content', 'utf8');

      const { drifted, checked } = await checkAdapterDrift(tmpDir, canonical, [guarded]);
      expect(drifted).toEqual([]);
      expect(checked).toContain(adapterPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('guardExisting adapter WITH a manifest record IS flagged when its content diverges (proctor wrote it, now tampered, the CR-01 fix)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const canonical = 'canonical content\n';
      const guarded: AgentAdapter = {
        id: 'fake-guarded', displayName: 'Fake Guarded', relativePath: 'guarded.md', scriptable: false, guardExisting: true,
      };
      const adapterPath = join(tmpDir, guarded.relativePath);
      writeFileSync(adapterPath, canonical, 'utf8');
      await recordWritten(tmpDir, guarded.id);

      // Not yet tampered: matches canonical, no drift.
      const clean = await checkAdapterDrift(tmpDir, canonical, [guarded]);
      expect(clean.drifted).toEqual([]);

      // Tampered after a recorded write: now real drift, must be flagged.
      writeFileSync(adapterPath, 'tampered content', 'utf8');
      const tampered = await checkAdapterDrift(tmpDir, canonical, [guarded]);
      expect(tampered.drifted).toContain(adapterPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('drift-check CLI (smoke)', () => {
  it('exits 0 immediately after install-skill in a clean tmpDir', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const install = spawnSync('node', [CLI, 'install-skill'], { cwd: tmpDir, encoding: 'utf8' });
      expect(install.status).toBe(0);
      const drift = spawnSync('node', [CLI, 'drift-check'], { cwd: tmpDir, encoding: 'utf8' });
      expect(drift.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 0 with zero drift for the two transformed adapters (Cursor .mdc, Copilot applyTo) — AGENT-04 nyquist validation', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const install = spawnSync('node', [CLI, 'install-skill'], { cwd: tmpDir, encoding: 'utf8' });
      expect(install.status).toBe(0);

      const drift = spawnSync('node', [CLI, 'drift-check'], { cwd: tmpDir, encoding: 'utf8' });
      expect(drift.status).toBe(0);
      expect(drift.stderr).toBe('');

      const cursorPath = join(tmpDir, '.cursor', 'rules', 'proctor.mdc');
      const cursorContent = readFileSync(cursorPath, 'utf8');
      expect(cursorContent.startsWith('---')).toBe(true);
      expect(cursorContent).toMatch(/RH0\d\d/);

      const copilotPath = join(tmpDir, '.github', 'instructions', 'proctor.instructions.md');
      const copilotContent = readFileSync(copilotPath, 'utf8');
      expect(copilotContent.startsWith('---')).toBe(true);
      expect(copilotContent).toContain('applyTo:');
      expect(copilotContent).toMatch(/RH0\d\d/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 1 and names the mutated path after a deployed adapter is edited', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const install = spawnSync('node', [CLI, 'install-skill'], { cwd: tmpDir, encoding: 'utf8' });
      expect(install.status).toBe(0);

      const skillPath = join(tmpDir, '.claude', 'skills', 'proctor', 'SKILL.md');
      appendFileSync(skillPath, '\nmutated\n', 'utf8');

      const drift = spawnSync('node', [CLI, 'drift-check'], { cwd: tmpDir, encoding: 'utf8' });
      expect(drift.status).toBe(1);
      expect(drift.stderr).toContain(skillPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
