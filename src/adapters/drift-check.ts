import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AGENT_ADAPTERS, type AgentAdapter } from './registry.js';

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
      // guardExisting adapters (e.g. Qodo's un-namespaced best_practices.md) may legitimately
      // hold user-owned content that install-skill deliberately declined to overwrite — that's
      // not proctor drift, it's install-skill's collision guard working as intended. Only
      // non-guarded adapters are flagged when their deployed content diverges from expected.
      //
      // KNOWN LIMITATION: this can't distinguish that legitimate case from a guardExisting path
      // that install-skill DID successfully write (destination was absent or already matched at
      // install time) and that has since been tampered with — both look identical from content
      // alone (deployed != expected). Closing this gap for real would need install-skill to
      // persist which guardExisting paths it actually wrote vs. skipped (a provenance record),
      // which doesn't exist today. Until that lands, a guardExisting adapter's drift is silently
      // unverifiable either way — err on not flagging, since a false "drifted" on the common,
      // correct collision case is worse than a missed true positive on the rare tampered case.
      if (!adapter.guardExisting) {
        drifted.push(path);
      }
    }
  }

  return { drifted, checked };
}
