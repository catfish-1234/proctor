import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGitDiff } from '../src/diff.js';
import { classifyDiff } from '../src/pre-classifier.js';

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

describe('real git diffs', () => {
  function withRepo(run: (dir: string, git: (...args: string[]) => string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-diff-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    try {
      git('init', '-q');
      run(dir, git);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('parses tracked and untracked patches despite user color, prefix and relative settings', () => {
    withRepo((dir, git) => {
      git('config', 'color.ui', 'always');
      git('config', 'diff.noprefix', 'true');
      git('config', 'diff.relative', 'true');
      writeFileSync(join(dir, 'tracked.test.ts'), 'it.skip("tracked", () => {});\n');
      git('add', '.');
      writeFileSync(join(dir, 'untracked.test.ts'), 'it.skip("untracked", () => {});\n');
      const { raw, files } = runGitDiff(['--staged'], dir, { includeUntracked: true });
      expect(raw).not.toContain('\u001b[');
      expect(files.map(f => f.to)).toEqual(['tracked.test.ts', 'untracked.test.ts']);
      expect(files.every(f => f.chunks.some(c => c.changes.some(l => l.type === 'add')))).toBe(true);
    });
  });

  it('ignores an external diff driver and text conversion when reading source', () => {
    withRepo((dir, git) => {
      writeFileSync(join(dir, '.gitattributes'), '*.ts diff=custom\n');
      writeFileSync(join(dir, 'a.test.ts'), 'it.skip("a", () => {});\n');
      git('add', '.');
      git('config', 'diff.external', 'proctor-no-such-command');
      git('config', 'diff.custom.textconv', 'proctor-no-such-command');
      const { files } = runGitDiff(['--staged'], dir);
      expect(files.find(f => f.to === 'a.test.ts')?.additions).toBe(1);
    });
  });

  it('rejects a binary patch without dropping an adjacent CRLF text patch', () => {
    withRepo((dir, git) => {
      git('config', 'core.autocrlf', 'false');
      writeFileSync(join(dir, 'a.bin'), Buffer.from([0, 1, 2, 3]));
      writeFileSync(join(dir, 'b.test.ts'), 'it.skip("b", () => {});\r\n');
      git('add', '.');
      const { raw, files } = runGitDiff(['--staged'], dir);
      const { accepted, rejected } = classifyDiff(raw, files);
      expect(rejected.map(r => r.reason)).toEqual(['binary']);
      expect(accepted.map(f => f.to)).toEqual(['b.test.ts']);
      expect(accepted[0]?.chunks[0]?.changes[0]?.content).toBe('+it.skip("b", () => {});');
    });
  });

  it('reads patches larger than the subprocess default buffer and caps long source lines', () => {
    withRepo((dir, git) => {
      writeFileSync(join(dir, 'generated.txt'), 'generated content\n'.repeat(70_000) + 'x'.repeat(5000) + '\n');
      writeFileSync(join(dir, 'z.test.ts'), 'it.skip("still checked", () => {});\n');
      git('add', '.');
      const { raw, files } = runGitDiff(['--staged'], dir);
      expect(raw.length).toBeGreaterThan(1024 * 1024);
      expect(files.find(f => f.to === 'z.test.ts')?.additions).toBe(1);
      const lengths = files[0]!.chunks[0]!.changes.map(c => c.content.length);
      expect(lengths).toContain(4000);
      expect(lengths.every(length => length <= 4000)).toBe(true);
    });
  });

  it('returns no files for an empty diff and throws outside git', () => {
    withRepo((dir) => {
      expect(runGitDiff(['--staged'], dir)).toEqual({ raw: '', files: [] });
    });
    const dir = mkdtempSync(join(tmpdir(), 'proctor-not-git-'));
    try {
      expect(() => runGitDiff(['--staged'], dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
