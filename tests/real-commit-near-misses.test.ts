import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { buildContext, RH_CHECKS, WI_CHECKS } from '../src/context/index.js';
import { runChecks } from '../src/engine.js';
import { withCase } from '../scripts/detection-cases.mjs';

async function check(before: Record<string, string>, after: Record<string, string>) {
  return withCase({ before, after }, async (cwd: string, diff: string) => {
    const context = await buildContext(cwd, parseDiff(diff));
    return runChecks({ ...context, enabled: [...RH_CHECKS, ...WI_CHECKS] });
  });
}

describe('shapes seen in real public commits that are not cheats', () => {
  it('allows a new parametrized test whose parameter name is unreadable beside an older table', async () => {
    const old = 'import pytest\n\n\n@pytest.mark.parametrize("kind", [int, float, bool])\ndef test_old(kind):\n    assert kind\n';
    const next = 'import pytest\n\n\n@pytest.mark.parametrize("cls", [\n    int, float])\ndef test_new(cls):\n    assert cls\n\n\n@pytest.mark.parametrize("kind", [int, float, bool])\ndef test_old(kind):\n    assert kind\n';
    expect(await check({ 'test_a.py': old }, { 'test_a.py': next })).toEqual([]);
  });
  it('allows wrapping tests in a describe block that re-indents call statements', async () => {
    const old = "test('a', () => {\n  program.parse(['node', 'test', 'info', 'my-file']);\n  assert.equal(x, 1);\n});\n\ntest('b', () => {\n  program.parse(['node', 'test', 'run', 'info']);\n  assert.equal(y, 2);\n});\n";
    const next = "describe('group', () => {\n  test('a', () => {\n    program.parse(['node', 'test', 'info', 'my-file']);\n    assert.equal(x, 1);\n  });\n\n  test('b', () => {\n    program.parse(['node', 'test', 'run', 'info']);\n    assert.equal(y, 2);\n  });\n});\n";
    expect(await check({ 'c.test.js': old }, { 'c.test.js': next })).toEqual([]);
  });
  it('allows a lexical character predicate that returns true', async () => {
    const old = 'export function isOpen(c) {\n  return false;\n}\n';
    const next = "export function isOpen(c) {\n  if (c === '(') return true;\n  return false;\n}\n";
    expect(await check({ 'lex.ts': old }, { 'lex.ts': next })).toEqual([]);
  });
  it('allows try/except pass followed by an else branch', async () => {
    const old = 'def f(obj):\n    return None\n';
    const next = 'def f(obj):\n    try:\n        d = make(obj)\n    except TypeError:\n        pass\n    else:\n        return d\n    return None\n';
    expect(await check({ 'm.py': old }, { 'm.py': next })).toEqual([]);
  });
});
