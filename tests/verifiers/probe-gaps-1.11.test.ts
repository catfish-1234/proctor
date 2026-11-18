import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh002 } from '../../src/verifiers/rh002.js';
import { rh007 } from '../../src/verifiers/rh007.js';
import type { Context, Verifier } from '../../src/types.js';

// Cheats planted against 1.10.0 that passed every check.
const ctx = (diff: string, enabled: string[]): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts', '**/test_*.py'], testFiles: [], enabled,
  isTestFile: (p: string) => /\.test\.|(?:^|\/)(?:test_[^/]*|conftest)\.py$/.test(p), getLanguage: () => 'ts' as const,
});
const edit = (file: string, before: string, after: string) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,1 @@\n-${before}\n+${after}\n`;
const added = (file: string, lines: string[]) =>
  `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;
const run = async (verifier: Verifier, c: Context) => verifier.run(c);

describe('RH002: negated equality and empty object patterns', () => {
  it('reports toBe(5) replaced by not.toBe(4) on the same subject', async () => {
    const findings = await run(rh002, ctx(edit('math.test.ts',
      "  it('adds', () => { expect(add(2, 3)).toBe(5); });",
      "  it('adds', () => { expect(add(2, 3)).not.toBe(4); });"), ['RH002']));
    expect(findings.map(f => f.message)).toEqual(['Assertion weakened from toBe(5) to not.toBe(4).']);
  });

  it('reports toBe(2) replaced by toMatchObject({})', async () => {
    const findings = await run(rh002, ctx(edit('math.test.ts',
      "  expect(div(6, 3)).toBe(2);",
      "  expect({ v: div(6, 3) }).toMatchObject({});"), ['RH002']));
    expect(findings).toHaveLength(1);
  });

  it.each([
    ["  expect(result).toBe(5);", "  expect(result).toEqual({});"],
    ["  expect(err).toBeNull();", "  expect(err).not.toBe(null);"],
    ["  expect(user.id).toBe(7);", "  expect(user.id).toBe(8);"],
  ])('leaves %s -> %s alone', async (before, after) => {
    expect(await run(rh002, ctx(edit('math.test.ts', before, after), ['RH002']))).toEqual([]);
  });

  it('a newly added negated assertion on its own is fine', async () => {
    const diff = added('ids.test.ts', ["it('ids differ', () => { expect(a.id).not.toBe(b.id); });"]);
    expect(await run(rh002, ctx(diff, ['RH002']))).toEqual([]);
  });
});

describe('RH007: tests deselected in conftest.py', () => {
  it('reports a collection hook that drops items', async () => {
    const findings = await run(rh007, ctx(added('tests/conftest.py', [
      'def pytest_collection_modifyitems(config, items):',
      '    items[:] = [i for i in items if "negative" not in i.name]',
    ]), ['RH007']));
    expect(findings.map(f => [f.severity, f.line])).toEqual([['error', 2]]);
  });

  it.each([
    '    items.remove(items[0])',
    '    del items[1:]',
    '    config.hook.pytest_deselected(items=dropped)',
    '    items.clear()',
  ])('reports %s', async line => {
    const findings = await run(rh007, ctx(added('conftest.py', ['def pytest_collection_modifyitems(config, items):', line]), ['RH007']));
    expect(findings.some(f => f.severity === 'error')).toBe(true);
  });

  it('warns on a new pytest_ignore_collect hook', async () => {
    const findings = await run(rh007, ctx(added('conftest.py', ['def pytest_ignore_collect(collection_path, config):', '    return "legacy" in str(collection_path)']), ['RH007']));
    expect(findings.map(f => f.severity)).toEqual(['warn']);
  });

  it('leaves a hook that only adds markers alone', async () => {
    const findings = await run(rh007, ctx(added('conftest.py', [
      'def pytest_collection_modifyitems(config, items):',
      '    for item in items:',
      '        item.add_marker(pytest.mark.timeout(30))',
      '    # items[:] = sorted(items) is not used here',
    ]), ['RH007']));
    expect(findings).toEqual([]);
  });
});
