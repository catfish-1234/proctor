import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import parseDiff from 'parse-diff';
import { classifyDiff } from '../src/pre-classifier.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/preclass');

/** Try to read a fixture file; return fallback string if not found yet (Plan 05 creates them). */
function readFixture(name: string, fallback: string): string {
  try {
    return readFileSync(join(FIXTURES_DIR, name), 'utf8');
  } catch {
    return fallback;
  }
}

// Inline fallback diff strings for each rejection type

const BINARY_DIFF = `diff --git a/img.png b/img.png
index abc1234..def5678
Binary files a/img.png and b/img.png differ
`;

const MODE_ONLY_DIFF = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`;

const SUBMODULE_DIFF = `diff --git a/vendor/lib b/vendor/lib
index abc1234..def5678 160000
--- a/vendor/lib
+++ b/vendor/lib
@@ -1 +1 @@
-Subproject commit abc1234abc1234abc1234abc1234abc1234abc1234
+Subproject commit def5678def5678def5678def5678def5678def5678
`;

const COMBINED_DIFF = `diff --combined a/src/index.ts
index abc,def..ghi
@@@ -1,3 -1,3 +1,4 @@@
 line1
+ added line
 line2
 line3
`;

const RENAME_ONLY_DIFF = `diff --git a/old-name.ts b/new-name.ts
similarity index 100%
rename from old-name.ts
rename to new-name.ts
`;

const CLEAN_UNIFIED_DIFF = `diff --git a/src/calc.ts b/src/calc.ts
index abc1234..def5678 100644
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,3 +1,4 @@
 export function add(a: number, b: number) {
+  return a + b;
 }
`;

const CRLF_DIFF = CLEAN_UNIFIED_DIFF.replace(/\n/g, '\r\n');

describe('classifyDiff pre-classifier', () => {
  it('rejects binary diff', () => {
    const raw = readFixture('binary.diff', BINARY_DIFF);
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    const reasons = result.rejected.map(r => r.reason);
    expect(reasons).toContain('binary');
  });

  it('rejects mode-only diff', () => {
    const raw = readFixture('mode-only.diff', MODE_ONLY_DIFF);
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    const reasons = result.rejected.map(r => r.reason);
    expect(reasons).toContain('mode-only');
  });

  it('rejects submodule pointer update', () => {
    const raw = readFixture('submodule.diff', SUBMODULE_DIFF);
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    const reasons = result.rejected.map(r => r.reason);
    expect(reasons).toContain('submodule');
  });

  it('normalizes CRLF and passes clean diff through', () => {
    // CRLF is a normalization concern for runGitDiff; classifyDiff sees normalized input.
    // Mimic what runGitDiff does: normalize \r\n → \n before passing to parseDiff.
    const raw = readFixture('crlf.diff', CRLF_DIFF).replace(/\r\n/g, '\n');
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    // A clean diff with normalized CRLF must not be rejected
    expect(result.rejected.length).toBe(0);
    expect(result.accepted.length).toBeGreaterThan(0);
  });

  it('rejects combined diff (triple-@@@)', () => {
    const raw = readFixture('combined.diff', COMBINED_DIFF);
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    const reasons = result.rejected.map(r => r.reason);
    expect(reasons.some(r => r.includes('combined'))).toBe(true);
  });

  it('rejects rename-only diff', () => {
    const raw = readFixture('rename-only.diff', RENAME_ONLY_DIFF);
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    const reasons = result.rejected.map(r => r.reason);
    expect(reasons).toContain('rename-only');
  });

  it('passes a clean unified diff through accepted', () => {
    const raw = CLEAN_UNIFIED_DIFF;
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    expect(result.accepted.length).toBeGreaterThan(0);
    expect(result.rejected.length).toBe(0);
  });

  it('mixed diff: binary file rejected, clean file accepted', () => {
    const raw = BINARY_DIFF + CLEAN_UNIFIED_DIFF;
    const files = parseDiff(raw);
    const result = classifyDiff(raw, files);
    expect(result.rejected.some(r => r.reason === 'binary')).toBe(true);
    expect(result.accepted.length).toBeGreaterThan(0);
  });
});
