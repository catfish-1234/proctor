// This check runs unconditionally on any config file change; it doesn't try to correlate the
// change with anything else in the diff. That's a deliberate simplification, not an oversight.
import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';

const CONFIG_FILE_RE = /(?:jest|vitest)\.config\.[mc]?[jt]s$|tsconfig(?:\.[^/]*)?\.json$|(?:pytest\.ini|setup\.cfg|pyproject\.toml|conftest\.py)$/;

// proctor's own config: enforcement is pinned to the committed version (see buildContext's
// configRef), so an in-diff edit can't neuter checks — but the edit itself is still worth
// surfacing, since it changes what future runs enforce.
const PROCTOR_CONFIG_RE = /(?:^|\/)proctor\.config\.json$/;
const PROCTOR_ENFORCEMENT_KEY_RE = /"(enabled|ignorePatterns|severity|testPathGlobs|snapshotGlobs)"\s*:/;

function isConfigFile(filePath: string): boolean {
  return CONFIG_FILE_RE.test(filePath);
}

function configLabel(filePath: string): string {
  const base = path.basename(filePath);
  if (/^jest\.config\./.test(base)) return 'jest config';
  if (/^vitest\.config\./.test(base)) return 'vitest config';
  if (/^tsconfig/.test(base)) return 'tsconfig';
  if (base === 'pytest.ini') return 'pytest config';
  return base;
}

const EXCLUSION_PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /testPathIgnorePatterns/, key: 'testPathIgnorePatterns' },
  { re: /testMatch\b/, key: 'testMatch' },
  { re: /testRegex\b/, key: 'testRegex' },
  { re: /"exclude"\s*:/, key: '"exclude"' },
  // Unquoted object key in a TS/JS config (vitest `test.exclude`). Kept after the quoted JSON
  // form so tsconfig lines keep their existing key label. Gated below on a test-looking value,
  // since `coverage.exclude` in the same files is routine and not a test-run exclusion.
  { re: /\bexclude\s*:/, key: 'exclude' },
  { re: /norecursedirs/, key: 'norecursedirs' },
  { re: /ignore\s*=/, key: 'ignore' },
  { re: /testpaths\s*=/, key: 'testpaths' },
  { re: /collect_ignore/, key: 'collect_ignore' },
];

function matchExclusion(content: string): { key: string; afterMatch: string } | null {
  for (const { re, key } of EXCLUSION_PATTERNS) {
    const m = re.exec(content);
    if (m) return { key, afterMatch: content.slice(m.index + m[0].length) };
  }
  return null;
}

function run(context: Context): Finding[] {
  const files = context.files;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';

    if (PROCTOR_CONFIG_RE.test(filePath.replace(/\\/g, '/'))) {
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add') continue;
          const keyMatch = change.content.match(PROCTOR_ENFORCEMENT_KEY_RE);
          if (!keyMatch) continue;
          findings.push({
            verifierId: 'RH007',
            severity: 'warn',
            file: filePath,
            line: change.ln,
            message: `proctor.config.json '${keyMatch[1]!}' modified in this change — enforcement settings changed for future runs.`,
            suggestion: 'Review the config change; this run still enforces the committed configuration.',
          });
        }
      }
      continue;
    }

    if (!isConfigFile(filePath)) continue;

    for (const chunk of file.chunks) {
      // A bare `exclude:` inside a coverage block (`coverage.exclude` in vitest/jest) routinely
      // lists test globs and is not a test-run exclusion — skip the bare-key heuristic for the
      // whole chunk when coverage context is visible in it.
      const chunkMentionsCoverage = chunk.changes.some(c => /\bcoverage\b/.test(c.content));

      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;

        const matched = matchExclusion(change.content);
        if (!matched) continue;

        const { key, afterMatch } = matched;
        const quotedMatch = afterMatch.match(/['"`]([^'"`\r\n]+)['"`]/);
        const excludedVal = quotedMatch ? quotedMatch[1] : 'test files';
        // The bare `exclude:` key only counts when the excluded value on the line looks like a
        // test path — otherwise it's likely a coverage/build exclude, not test-run gaming.
        if (key === 'exclude' && (chunkMentionsCoverage || !/test|spec/i.test(quotedMatch?.[1] ?? ''))) continue;

        findings.push({
          verifierId: 'RH007',
          // The bare-key form can't fully distinguish test.exclude from a coverage exclude
          // outside the visible chunk, so it warns rather than blocks; the exact-key patterns
          // (testPathIgnorePatterns, "exclude": ...) stay errors.
          severity: key === 'exclude' ? 'warn' : 'error',
          file: filePath,
          line: change.ln,
          message: `Test path ignore pattern added to ${configLabel(filePath)} excluding ${excludedVal}.`,
          suggestion: `Remove ${key} entry added in this change.`,
        });
      }
    }
  }

  return findings;
}

export const rh007: Verifier = { id: 'RH007', severity: 'error', run };
