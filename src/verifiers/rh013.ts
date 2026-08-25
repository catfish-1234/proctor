import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';

/**
 * Coverage gate weakened.
 *
 * RH007 catches tests excluded from the run. This catches the gate that was supposed to notice
 * they were gone. Dropping `fail_under` from 90 to 40, or deleting the threshold block outright,
 * makes a suite that lost half its coverage report as passing, and unlike a deleted test it
 * leaves no gap anyone reading the test files would see.
 *
 * Only a number that moved *down* is reported. Raising a threshold, or adding one where there was
 * none, is the change this check wants people to make.
 */

// Config files that can carry a coverage threshold, across the ecosystems proctor supports.
const COVERAGE_CONFIG_RE =
  /(?:jest|vitest|vite)\.config\.(?:[mc]?[jt]s|json)$|(?:^|\/)package\.json$|(?:^|\/)\.nycrc(?:\.json)?$|(?:^|\/)\.coveragerc$|(?:^|\/)setup\.cfg$|(?:^|\/)pyproject\.toml$|(?:^|\/)pytest\.ini$|(?:^|\/)tox\.ini$|(?:^|\/)pom\.xml$|(?:^|\/)build\.gradle(?:\.kts)?$|(?:^|\/)\.simplecov$|(?:^|\/)phpunit\.xml(?:\.dist)?$|(?:^|\/)codecov\.ya?ml$|(?:^|\/)\.codecov\.ya?ml$/;

/**
 * Keys whose value is a coverage percentage.
 *
 * Each is a dedicated threshold setting, not a general number that happens to live nearby, so a
 * value that drops is unambiguous rather than a guess about what the number meant.
 */
// The optional quote before the separator is what makes JSON reachable. Requiring the colon
// immediately after the key means JSON never matched, since the closing quote sits between
// them: `"lines": 90` was invisible. package.json, jest.config.json, .nycrc and .nycrc.json are
// all listed as coverage configs and none of them could produce a finding, with package.json
// being much the most common home for coverageThreshold.
const THRESHOLD_KEY_RE =
  /\b(lines|statements|functions|branches|fail_under|fail-under|minimum_coverage|minimumCoverage|min_coverage|coverage_threshold|target|threshold|minimum|COVERAGE_MIN|haltOnFailure|minimumInstructionCoverage)\b['"]?\s*[:=]\s*['"]?(\d+(?:\.\d+)?)\s*%?['"]?/;

interface Threshold {
  key: string;
  value: number;
}

function isCoverageConfig(filePath: string): boolean {
  return COVERAGE_CONFIG_RE.test(filePath.replace(/\\/g, '/'));
}

function parseThreshold(content: string): Threshold | undefined {
  const m = THRESHOLD_KEY_RE.exec(content);
  if (!m) return undefined;
  const value = Number(m[2]);
  return Number.isFinite(value) ? { key: m[1]!, value } : undefined;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = file.to ?? file.from ?? '';
    if (!isCoverageConfig(filePath)) continue;

    for (const chunk of file.chunks) {
      // A threshold edit shows up as the old line removed and the new one added. Pair them by
      // key within the chunk: comparing by key rather than by position means a reformatted or
      // reordered config still pairs correctly, and an unrelated key cannot pair by accident.
      const removed = new Map<string, number>();
      for (const change of chunk.changes) {
        if (change.type !== 'del') continue;
        const threshold = parseThreshold(change.content);
        if (threshold) removed.set(threshold.key, threshold.value);
      }

      const addedKeys = new Set<string>();
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        const threshold = parseThreshold(change.content);
        if (!threshold) continue;
        addedKeys.add(threshold.key);

        const before = removed.get(threshold.key);
        if (before === undefined || threshold.value >= before) continue;

        findings.push({
          verifierId: 'RH013',
          severity: 'error',
          file: filePath,
          line: change.ln,
          message: `Coverage threshold '${threshold.key}' lowered from ${before} to ${threshold.value} in ${path.basename(filePath)}, so less coverage than before now passes.`,
          suggestion: `Restore the '${threshold.key}' threshold to ${before} and add the tests that bring coverage back up to it.`,
        });
      }

      // A threshold deleted outright is the same evasion with no number to compare, and it is
      // strictly worse: nothing enforces coverage at all afterwards.
      for (const [key, before] of removed) {
        if (addedKeys.has(key)) continue;
        const line = chunk.changes.find(c => c.type === 'del' && parseThreshold(c.content)?.key === key);
        findings.push({
          verifierId: 'RH013',
          severity: 'error',
          file: filePath,
          line: (line as { ln?: number } | undefined)?.ln ?? chunk.oldStart,
          message: `Coverage threshold '${key}' (was ${before}) removed from ${path.basename(filePath)}, so nothing enforces a coverage floor now.`,
          suggestion: `Restore the '${key}' threshold, or say why this project no longer gates on coverage.`,
        });
      }
    }
  }

  return findings;
}

export const rh013: Verifier = { id: 'RH013', severity: 'error', run };
