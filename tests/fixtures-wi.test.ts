import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { wi101 } from '../src/verifiers/wi101.js';
import { wi102 } from '../src/verifiers/wi102.js';
import { wi103 } from '../src/verifiers/wi103.js';
import { wi104 } from '../src/verifiers/wi104.js';
import { wi105 } from '../src/verifiers/wi105.js';
import { wi106 } from '../src/verifiers/wi106.js';
import { wi107 } from '../src/verifiers/wi107.js';
import { wi108 } from '../src/verifiers/wi108.js';
import type { Context, Finding, Language, Verifier } from '../src/types.js';
import type { ParsedFile } from '../src/diff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/**
 * Same harness as fixtures-p3.test.ts: real `git diff --no-index` over the fixture's before/ and
 * after/ trees, so every signature is proven against a diff git actually produced rather than a
 * hand-assembled ParsedFile that could quietly disagree with the real thing.
 */
function fixtureDiff(relDir: string): ParsedFile[] {
  const beforeDir = path.join(FIXTURES_DIR, relDir, 'before');
  const afterDir = path.join(FIXTURES_DIR, relDir, 'after');
  const result = spawnSync('git', ['diff', '--no-index', '--', beforeDir, afterDir], { encoding: 'utf8' });
  return parseDiff(result.stdout);
}

/**
 * Extension-based language, unlike the p3 harness's fixed 'ts'. WI106 scopes itself to typed
 * languages via context.getLanguage, so a stubbed-constant language would let it fire on files it
 * would skip in production, which is the one thing a fixture test must never do.
 */
function languageOf(filePath: string): Language {
  if (/\.tsx?$/.test(filePath)) return 'ts';
  if (/\.jsx?$/.test(filePath)) return 'js';
  if (/\.py$/.test(filePath)) return 'python';
  if (/\.go$/.test(filePath)) return 'go';
  return 'unknown';
}

function baseCtx(): Context {
  return {
    cwd: '',
    files: [],
    testPathGlobs: ['**/*.test.ts'],
    testFiles: [],
    enabled: [],
    isTestFile: (p: string) => p.includes('.test.') || p.includes('_test.'),
    getLanguage: languageOf,
    aiEnabled: false,
    judge: undefined,
  };
}

async function runFixture(verifier: Verifier, relDir: string): Promise<Finding[]> {
  const files = fixtureDiff(relDir);
  const findings = await verifier.run({ ...baseCtx(), files });
  // Normalize to the basename so results don't depend on where the checkout lives.
  return findings.map(f => ({ ...f, file: path.basename(f.file) }));
}

const CASES: Array<{ id: string; verifier: Verifier }> = [
  { id: 'WI101', verifier: wi101 },
  { id: 'WI102', verifier: wi102 },
  { id: 'WI103', verifier: wi103 },
  { id: 'WI104', verifier: wi104 },
  { id: 'WI105', verifier: wi105 },
  { id: 'WI106', verifier: wi106 },
  { id: 'WI107', verifier: wi107 },
  { id: 'WI108', verifier: wi108 },
];

describe('WI fixtures, true-positive fires, near-miss stays silent', () => {
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

/**
 * The family-wide invariant. Every WI check reads shipped code, and every one of their signatures
 * means something ordinary inside a test: an empty catch is how you assert a throw, canned data is
 * what a fixture is, and a loose cast is routine when building a partial mock. A check that starts
 * firing on test files would be unusable on day one, so this is asserted rather than assumed.
 */
describe('WI family, test files are out of scope', () => {
  const testFileDiff: ParsedFile[] = parseDiff(
    [
      'diff --git a/src/thing.test.ts b/src/thing.test.ts',
      'index 1111111..2222222 100644',
      '--- a/src/thing.test.ts',
      '+++ b/src/thing.test.ts',
      '@@ -1,3 +1,8 @@',
      ' describe("thing", () => {',
      '+  it("throws", () => {',
      '+    try { thing(); } catch (e) {}',
      '+    const payload: any = buildMockPayload();',
      '+    return MOCK_RESPONSE;',
      '+  });',
      ' });',
    ].join('\n'),
  );

  for (const { id, verifier } of CASES) {
    it(`${id}: stays silent on a test file`, async () => {
      const findings = await verifier.run({ ...baseCtx(), files: testFileDiff });
      expect(findings).toEqual([]);
    });
  }
});
