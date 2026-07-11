import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { checkAdapterDrift } from '../src/adapters/drift-check.js';
import { AGENT_ADAPTERS } from '../src/adapters/registry.js';

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
