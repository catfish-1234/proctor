import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MANIFEST_FILENAME = '.proctor-adapter-manifest.json';

/**
 * Install-provenance record for `shared` adapters (AGENTS.md, GEMINI.md, WARP.md, ...).
 *
 * A shared file with no managed proctor block is ambiguous from content alone: either proctor was
 * never installed for that agent, or it was installed and the block has since been deleted. The
 * second case is exactly the tampering proctor exists to catch. `written[adapterId] = true` means
 * install-skill did write a block to that path, so a later missing or modified block is drift.
 *
 * This file is meant to be committed alongside the adapter files it tracks, so drift-check works
 * consistently across clones and CI, the same way the adapter files themselves are committed.
 */
export interface AdapterManifest {
  written: Record<string, true>;
  /**
   * Adapters whose file did not exist before proctor installed. Only these may be deleted on
   * uninstall; a file that was already there is the user's, and proctor may only take its own
   * block out of it. Absent for manifests written before this field existed, which reads as "we
   * do not know", and not knowing means not deleting.
   */
  created?: Record<string, true>;
}

function isValidManifest(value: unknown): value is AdapterManifest {
  if (typeof value !== 'object' || value === null) return false;
  const written = (value as { written?: unknown }).written;
  return typeof written === 'object' && written !== null && !Array.isArray(written);
}

/** Malformed or missing manifest reads as empty, no adapter has recorded provenance yet. */
export async function readManifest(cwd: string): Promise<AdapterManifest> {
  try {
    const raw = await readFile(join(cwd, MANIFEST_FILENAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isValidManifest(parsed)) return parsed;
  } catch {
    // ENOENT (never installed a guardExisting adapter yet) or malformed JSON, both read as empty.
  }
  return { written: {} };
}

/** Idempotent: recording an already-recorded adapter id is a no-op, no unnecessary write. */
export async function recordWritten(cwd: string, adapterId: string, created = false): Promise<void> {
  const manifest = await readManifest(cwd);
  const alreadyWritten = manifest.written[adapterId] === true;
  const alreadyCreated = manifest.created?.[adapterId] === true;
  if (alreadyWritten && (!created || alreadyCreated)) return;
  manifest.written[adapterId] = true;
  if (created) {
    manifest.created = { ...manifest.created, [adapterId]: true };
  }
  await writeFile(join(cwd, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
