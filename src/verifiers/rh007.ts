// This check runs unconditionally on any config file change; it doesn't try to correlate the
// change with anything else in the diff. That's a deliberate simplification, not an oversight.
import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';

const CONFIG_FILE_RE = /(?:jest|vitest)\.config\.[mc]?[jt]s$|tsconfig(?:\.[^/]*)?\.json$|(?:pytest\.ini|setup\.cfg|pyproject\.toml|conftest\.py)$/;

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
    if (!isConfigFile(filePath)) continue;

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;

        const matched = matchExclusion(change.content);
        if (!matched) continue;

        const { key, afterMatch } = matched;
        const quotedMatch = afterMatch.match(/['"`]([^'"`\r\n]+)['"`]/);
        const excludedVal = quotedMatch ? quotedMatch[1] : 'test files';

        findings.push({
          verifierId: 'RH007',
          severity: 'error',
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
