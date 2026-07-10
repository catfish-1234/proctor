import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh004 } from '../src/verifiers/rh004.js';
import { rh005 } from '../src/verifiers/rh005.js';
import { rh006 } from '../src/verifiers/rh006.js';
import { rh008 } from '../src/verifiers/rh008.js';
import { rh009 } from '../src/verifiers/rh009.js';
import { rh010 } from '../src/verifiers/rh010.js';
import { rh011 } from '../src/verifiers/rh011.js';
import type { Context, Finding, Verifier } from '../src/types.js';
import type { ParsedFile } from '../src/diff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/**
 * Diffs a fixture's before/ and after/ dirs with real `git diff --no-index` and parses it,
 * the same way rh001.test.ts does, so every signature is verified against an actual generated
 * diff, not a hand-rolled ParsedFile fixture.
 */
function fixtureDiff(relDir: string): ParsedFile[] {
  const beforeDir = path.join(FIXTURES_DIR, relDir, 'before');
  const afterDir = path.join(FIXTURES_DIR, relDir, 'after');
  const result = spawnSync('git', ['diff', '--no-index', '--', beforeDir, afterDir], { encoding: 'utf8' });
  return parseDiff(result.stdout);
}

function readCommitMessage(relDir: string): string | undefined {
  const p = path.join(FIXTURES_DIR, relDir, 'commit-message.txt');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : undefined;
}

function baseCtx(commitMessage?: string, committedDiff?: boolean): Context {
  return {
    cwd: '',
    files: [],
    testPathGlobs: ['**/*.test.ts'],
    testFiles: [],
    enabled: [],
    isTestFile: (p: string) => p.includes('.test.'),
    getLanguage: () => 'ts' as const,
    commitMessage,
    committedDiff,
    aiEnabled: false,
    judge: undefined,
  };
}

async function runFixture(verifier: Verifier, relDir: string): Promise<Finding[]> {
  const files = fixtureDiff(relDir);
  const commitMessage = readCommitMessage(relDir);
  // A commit-message.txt fixture represents a *committed* change checked via `--base` (the only
  // flow where RH006's reason-suppression applies, per Finding #3's fix) — not an uncommitted
  // working-tree diff, where the "last commit" message can't be trusted as a reason for this change.
  const committedDiff = commitMessage !== undefined;
  const findings = await verifier.run({ ...baseCtx(commitMessage, committedDiff), files });
  // Normalize the diffed path down to its basename so results are stable regardless of
  // where the repo checkout lives (mirrors rh001.test.ts's existing convention).
  return findings.map(f => ({ ...f, file: path.basename(f.file) }));
}

const CASES: Array<{ id: string; verifier: Verifier }> = [
  { id: 'RH004', verifier: rh004 },
  { id: 'RH005', verifier: rh005 },
  { id: 'RH006', verifier: rh006 },
  { id: 'RH008', verifier: rh008 },
  { id: 'RH009', verifier: rh009 },
  { id: 'RH010', verifier: rh010 },
  { id: 'RH011', verifier: rh011 },
];

describe('P3 fixtures — true-positive fires, near-miss stays silent (no --ai)', () => {
  for (const { id, verifier } of CASES) {
    it(`${id}: true-positive fixture flags exactly the expected finding(s)`, async () => {
      const actual = await runFixture(verifier, id);
      const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, id, 'expected.json'), 'utf8'));
      expect(actual).toMatchObject(expected);
      expect(actual.length).toBe(expected.length);
    });

    it(`${id}: near-miss legitimate fixture stays silent`, async () => {
      const actual = await runFixture(verifier, `${id}/negative`);
      const expected = JSON.parse(
        readFileSync(path.join(FIXTURES_DIR, id, 'negative-expected.json'), 'utf8'),
      );
      expect(actual).toEqual(expected);
    });
  }
});
