import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AGENT_ADAPTERS, type AgentAdapter } from './registry.js';
import { readManifest } from './manifest.js';

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
 * skipped — an absent file is not "drifted", it's simply not deployed yet.
 * Other read errors are surfaced to stderr but do not stop the scan.
 *
 * Each adapter's expected content is computed PER ADAPTER inside the loop —
 * `adapter.transform(canonical)` when present, else raw `canonical` — so a
 * legitimately-transformed adapter (e.g. Cursor's `.mdc` frontmatter) reports
 * zero drift instead of permanently false-positiving against a single
 * raw-canonical hash computed once outside the loop.
 *
 * `guardExisting` adapters (e.g. Qodo's un-namespaced best_practices.md) get one extra check:
 * a content mismatch only counts as drift if the install-provenance manifest (manifest.ts)
 * records that proctor actually wrote this adapter's path at some point. If install-skill
 * never wrote it (the path held pre-existing, unrelated content that the collision guard
 * correctly declined to overwrite), a mismatch is expected and not drift. If proctor DID write
 * it and the content has since diverged, that's real drift and is now reported like any other
 * adapter — closing the blind spot a raw guardExisting exclusion used to have.
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
        // Not installed — not drifted.
        continue;
      }
      process.stderr.write(`proctor: failed to read ${path}: ${String(err)}\n`);
      continue;
    }
    checked.push(path);
    const expected = adapter.transform ? adapter.transform(canonical) : canonical;
    if (sha256(content) !== sha256(expected)) {
      // Only flag a guardExisting adapter when the manifest proves proctor actually wrote this
      // path — otherwise a mismatch is the collision guard working as intended, not drift.
      const guardedButNeverWritten = adapter.guardExisting && !manifest.written[adapter.id];
      if (!guardedButNeverWritten) {
        drifted.push(path);
      }
    }
  }

  return { drifted, checked };
}
