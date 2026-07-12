// This check runs unconditionally on any config file change; it doesn't try to correlate the
// change with anything else in the diff. That's a deliberate simplification, not an oversight.
import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';

// Covers jest/vitest config in .{m,c}{j,t}s AND jest.config.json (a supported Jest format), plus
// vite.config.* (where Vitest config commonly lives), tsconfig, and the Python config files.
const CONFIG_FILE_RE = /(?:jest|vitest|vite)\.config\.(?:[mc]?[jt]s|json)$|(?:^|\/)jest\.config\.json$|tsconfig(?:\.[^/]*)?\.json$|(?:pytest\.ini|setup\.cfg|pyproject\.toml|conftest\.py)$/;

// package.json can carry a Jest config inline ("jest": { "testPathIgnorePatterns": [...] }). It is
// not a dedicated config file, so it's handled separately and only for testPathIgnorePatterns —
// the unambiguous "exclude tests from the run" key. testMatch/testRegex are omitted here because
// a first-time add is indistinguishable from a narrowing edit on a single line.
const PACKAGE_JSON_RE = /(?:^|\/)package\.json$/;
const JEST_EXCLUSION_KEY_RE = /"(testPathIgnorePatterns)"\s*:/;

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
  if (/^vite\.config\./.test(base)) return 'vite/vitest config';
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
  // pytest addopts with a -k/-m/--deselect expression deselects matching tests from every run.
  // Ambiguous (can be legit default selection), so reported as warn below.
  { re: /\baddopts\b[^\n]*(?:\s-k\b|\s-m\b|--deselect\b)/, key: 'addopts' },
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

    // package.json: only jest-specific exclusion keys count, so unrelated edits don't fire.
    if (PACKAGE_JSON_RE.test(filePath.replace(/\\/g, '/'))) {
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          if (change.type !== 'add') continue;
          const keyMatch = change.content.match(JEST_EXCLUSION_KEY_RE);
          if (!keyMatch) continue;
          const quoted = change.content.slice(change.content.indexOf(keyMatch[0]) + keyMatch[0].length).match(/['"`]([^'"`\r\n]+)['"`]/);
          findings.push({
            verifierId: 'RH007',
            severity: 'error',
            file: filePath,
            line: change.ln,
            message: `Test path ignore pattern added to package.json Jest config excluding ${quoted ? quoted[1] : 'test files'}.`,
            suggestion: `Remove the ${keyMatch[1]!} entry added in this change.`,
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
        // Both the bare `exclude:` and the quoted `"exclude":` (tsconfig/jest json) keys only
        // count when the excluded value looks test-like. tsconfig `"exclude": ["node_modules",
        // "dist"]` and coverage excludes are routine build config, not test-run gaming.
        const isExcludeKey = key === 'exclude' || key === '"exclude"';
        if (isExcludeKey && (chunkMentionsCoverage || !/test|spec/i.test(quotedMatch?.[1] ?? ''))) continue;
        // exclude keys and pytest addopts -k/-m are ambiguous (coverage/build excludes, default
        // test selection), so they warn; the dedicated test-run keys stay errors.
        const isSoftKey = isExcludeKey || key === 'addopts';

        findings.push({
          verifierId: 'RH007',
          severity: isSoftKey ? 'warn' : 'error',
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
