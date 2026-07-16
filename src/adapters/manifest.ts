import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MANIFEST_FILENAME = '.proctor-adapter-manifest.json';

/**
 * Install-provenance record for `guardExisting` adapters (e.g. Qodo's un-namespaced
 * best_practices.md). Without this, drift-check has no way to distinguish a guardExisting path
 * that was never proctor's (install-skill correctly declined to overwrite pre-existing unrelated
 * content) from one proctor DID successfully write that has since been tampered with — both look
 * identical from file content alone. `written[adapterId] = true` means install-skill has, at some
 * point, actually written proctor's content to that adapter's path (either because it was absent,
 * or because it already matched) — so a later content mismatch is real drift, not a guard.
 *
 * This file is meant to be committed alongside the adapter files it tracks, so drift-check works
 * consistently across clones and CI, the same way the adapter files themselves are committed.
 */
export interface AdapterManifest {
  written: Record<string, true>;
}

function isValidManifest(value: unknown): value is AdapterManifest {
  if (typeof value !== 'object' || value === null) return false;
  const written = (value as { written?: unknown }).written;
  return typeof written === 'object' && written !== null && !Array.isArray(written);
}

/** Malformed or missing manifest reads as empty — no adapter has recorded provenance yet. */
export async function readManifest(cwd: string): Promise<AdapterManifest> {
  try {
    const raw = await readFile(join(cwd, MANIFEST_FILENAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isValidManifest(parsed)) return parsed;
  } catch {
    // ENOENT (never installed a guardExisting adapter yet) or malformed JSON — both read as empty.
  }
  return { written: {} };
}

/** Idempotent: recording an already-recorded adapter id is a no-op, no unnecessary write. */
export async function recordWritten(cwd: string, adapterId: string): Promise<void> {
  const manifest = await readManifest(cwd);
  if (manifest.written[adapterId]) return;
  manifest.written[adapterId] = true;
  await writeFile(join(cwd, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
