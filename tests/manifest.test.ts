import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { readManifest, recordWritten, MANIFEST_FILENAME } from '../src/adapters/manifest.js';

describe('adapter install-provenance manifest', () => {
  it('reads as empty when the manifest file does not exist', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const manifest = await readManifest(tmpDir);
      expect(manifest).toEqual({ written: {} });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reads as empty (not a crash) when the manifest file is malformed JSON', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      writeFileSync(join(tmpDir, MANIFEST_FILENAME), 'not valid json {{{', 'utf8');
      const manifest = await readManifest(tmpDir);
      expect(manifest).toEqual({ written: {} });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reads as empty when the manifest file has the wrong shape (no written object)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      writeFileSync(join(tmpDir, MANIFEST_FILENAME), JSON.stringify(['not', 'the', 'right', 'shape']), 'utf8');
      const manifest = await readManifest(tmpDir);
      expect(manifest).toEqual({ written: {} });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('recordWritten creates the manifest file and marks the adapter id written', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      await recordWritten(tmpDir, 'qodo');
      expect(existsSync(join(tmpDir, MANIFEST_FILENAME))).toBe(true);
      const manifest = await readManifest(tmpDir);
      expect(manifest.written['qodo']).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('recordWritten is idempotent and preserves other adapter ids already recorded', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      await recordWritten(tmpDir, 'qodo');
      await recordWritten(tmpDir, 'another-guarded-adapter');
      await recordWritten(tmpDir, 'qodo'); // repeat, should be a no-op

      const manifest = await readManifest(tmpDir);
      expect(manifest.written['qodo']).toBe(true);
      expect(manifest.written['another-guarded-adapter']).toBe(true);
      expect(Object.keys(manifest.written)).toHaveLength(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes readable, stable JSON (trailing newline, 2-space indent)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      await recordWritten(tmpDir, 'qodo');
      const raw = readFileSync(join(tmpDir, MANIFEST_FILENAME), 'utf8');
      expect(raw.endsWith('\n')).toBe(true);
      expect(raw).toContain('  "written"');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
