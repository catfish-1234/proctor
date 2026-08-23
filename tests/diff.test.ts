import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGitDiff } from '../src/diff.js';

// Minimal valid unified diff, two-file change, one line added
const INLINE_UNIFIED_DIFF = `diff --git a/src/calc.ts b/src/calc.ts
index abc1234..def5678 100644
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,3 +1,4 @@
 export function add(a: number, b: number) {
+  // trivial fixture line
   return a + b;
 }
`;

describe('parseDiff', () => {
  it('produces a non-empty File[] from a valid unified diff string', () => {
    const files = parseDiff(INLINE_UNIFIED_DIFF);
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('parsed file has expected shape', () => {
    const [file] = parseDiff(INLINE_UNIFIED_DIFF);
    expect(file).toBeDefined();
    expect(typeof file!.to).toBe('string');
    expect(file!.to).toBe('src/calc.ts');
    expect(Array.isArray(file!.chunks)).toBe(true);
    expect(file!.chunks.length).toBeGreaterThan(0);
  });

  it('returns empty array for empty input', () => {
    const files = parseDiff('');
    expect(files).toEqual([]);
  });

  it('add change has correct type and content', () => {
    const [file] = parseDiff(INLINE_UNIFIED_DIFF);
    const changes = file!.chunks.flatMap(c => c.changes);
    const added = changes.filter(c => c.type === 'add');
    expect(added.length).toBeGreaterThan(0);
    expect(added[0]!.content).toContain('trivial fixture line');
  });
});

describe('untracked discovery skips dependency trees', () => {
  it('does not report an un-gitignored node_modules as this change', () => {
    // A brand-new repository has no .gitignore yet, so --exclude-standard lets the whole
    // dependency tree through. `npm init -y && npm i @kavishdua/proctor && npx proctor check`
    // reported 73 errors on a first run, all of them inside other people's packages.
    const dir = mkdtempSync(join(tmpdir(), 'proctor-untracked-'));
    try {
      execSync('git init -q', { cwd: dir });
      mkdirSync(join(dir, 'node_modules', 'left-pad'), { recursive: true });
      writeFileSync(join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = () => 1;\n');
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'app.js'), 'export const app = 1;\n');

      const { files } = runGitDiff(['--staged'], dir, { includeUntracked: true });
      const paths = files.map(f => (f.to ?? f.from ?? '').replace(/\\/g, '/'));
      expect(paths.some(p => p.includes('src/app.js'))).toBe(true);
      expect(paths.some(p => p.includes('node_modules'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
