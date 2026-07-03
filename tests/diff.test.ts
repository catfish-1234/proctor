import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';

// Minimal valid unified diff — two-file change, one line added
const INLINE_UNIFIED_DIFF = `diff --git a/src/calc.ts b/src/calc.ts
index abc1234..def5678 100644
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,3 +1,4 @@
 export function add(a: number, b: number) {
+  // ponytail: trivial fixture
   return a + b;
 }
`;

describe('parseDiff (FOUND-02)', () => {
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
    expect(added[0]!.content).toContain('ponytail: trivial fixture');
  });
});
