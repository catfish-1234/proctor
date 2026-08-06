import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AGENT_ADAPTERS, type AgentAdapter } from './registry.js';
import { readManifest } from './manifest.js';
import { extractBlock } from './block.js';

export interface DriftCheckResult {
  drifted: string[];
  checked: string[];
}

// Normalize CRLF before hashing: git autocrlf checkouts on Windows rewrite deployed adapter
// files to CRLF while the packaged canonical stays LF, which would flag every adapter as
// drifted. Line-ending churn isn't drift; any content change still is.
function sha256(content: string): string {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Compares every deployed agent adapter file against the canonical SKILL.md
 * content by sha256 hash. Adapters that were never installed (ENOENT) are
 * skipped, an absent file is not "drifted", it's simply not deployed yet.
 * Other read errors are surfaced to stderr but do not stop the scan.
 *
 * Each adapter's expected content is computed PER ADAPTER inside the loop,
 * `adapter.transform(canonical)` when present, else raw `canonical`, so a
 * legitimately-transformed adapter (e.g. Cursor's `.mdc` frontmatter) reports
 * zero drift instead of permanently false-positiving against a single
 * raw-canonical hash computed once outside the loop.
 *
 * `shared` adapters (AGENTS.md, GEMINI.md, WARP.md, ...) hold user-authored content alongside
 * proctor's, so only the managed block is compared and the surrounding file is ignored. A file
 * with no managed block at all is "not deployed here" and is skipped, unless the
 * install-provenance manifest (manifest.ts) records that proctor did write a block to it, in
 * which case the block was deleted after install and that is drift. Removing the ruleset from a
 * shared file is exactly the tampering proctor exists to catch, which is why the manifest is
 * committed alongside the adapter files.
 *
 * `adapters` defaults to the real `AGENT_ADAPTERS` registry; the parameter
 * exists so tests can inject a transform-bearing adapter without mutating
 * the shared registry.
 */
export async function checkAdapterDrift(
  cwd: string,
  canonical: string,
  adapters: AgentAdapter[] = AGENT_ADAPTERS
): Promise<DriftCheckResult> {
  const drifted: string[] = [];
  const checked: string[] = [];
  const manifest = await readManifest(cwd);

  for (const adapter of adapters) {
    const path = join(cwd, adapter.relativePath);
    let content: string;
    try {
      content = await readFile(path, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Not installed, not drifted.
        continue;
      }
      process.stderr.write(`proctor: failed to read ${path}: ${String(err)}\n`);
      continue;
    }
    checked.push(path);
    const expected = adapter.transform ? adapter.transform(canonical) : canonical;

    if (adapter.shared) {
      const block = extractBlock(content);
      if (block === undefined) {
        // No managed block: not deployed here, unless proctor is on record as having written
        // one, in which case it was removed.
        if (manifest.written[adapter.id]) drifted.push(path);
        continue;
      }
      if (sha256(block) !== sha256(expected.trim())) drifted.push(path);
      continue;
    }

    if (sha256(content) !== sha256(expected)) {
      drifted.push(path);
    }
  }

  return { drifted, checked };
}
