import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh005 } from '../../src/verifiers/rh005.js';
import type { Context } from '../../src/types.js';

const ctx = (diff: string, testFiles: string[] = []): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts'], testFiles, enabled: ['RH005'],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)(?:test_[^/]*|conftest)\.py$/.test(p), getLanguage: () => 'ts' as const,
});
const added = (file: string, lines: string[]) =>
  `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}\n`;

describe('RH005: spies handed a fake result on the module under test', () => {
  it.each([
    "vi.spyOn(math, 'add').mockReturnValue(5);",
    "jest.spyOn(math, 'add').mockImplementation(() => 5);",
    "vi.spyOn(math, 'load').mockResolvedValueOnce({ ok: true });",
  ])('reports %s', async line => {
    const findings = await rh005.run(ctx(added('src/math.test.ts', ["import * as math from './math';", line])));
    expect(findings.map(f => f.message)).toEqual([expect.stringMatching(/module under test \(\.\/math\) with a fake/)]);
  });

  it('follows a require binding too', async () => {
    const findings = await rh005.run(ctx(added('math.test.ts', ["const math = require('../src/math');", "jest.spyOn(math, 'add').mockReturnValue(5);"])));
    expect(findings).toHaveLength(1);
  });

  it.each([
    [["import * as math from './math';", "const spy = vi.spyOn(math, 'add');", 'expect(spy).toHaveBeenCalledTimes(1);'], 'observes calls only'],
    [["import * as api from './api';", "vi.spyOn(api, 'fetchUser').mockResolvedValue({ id: 1 });"], 'fakes a dependency'],
    [["import * as math from 'mathjs';", "vi.spyOn(math, 'add').mockReturnValue(5);"], 'fakes a third-party package'],
  ])('stays quiet when the test %#', async lines => {
    expect(await rh005.run(ctx(added('src/math.test.ts', lines as string[])))).toEqual([]);
  });
});

describe('RH005: the module under test replaced in sys.modules', () => {
  it('reports test_calc.py stubbing calc', async () => {
    const findings = await rh005.run(ctx(added('tests/test_calc.py', ['import sys, types', 'sys.modules["calc"] = types.ModuleType("calc")'])));
    expect(findings).toHaveLength(1);
  });

  it('reports conftest.py stubbing a module a test file is named for', async () => {
    const diff = added('tests/conftest.py', ['import sys', 'from unittest.mock import MagicMock', "monkeypatch.setitem(sys.modules, 'pkg.calc', MagicMock())"]);
    const findings = await rh005.run(ctx(diff, ['tests/test_calc.py', 'tests/test_io.py']));
    expect(findings.map(f => f.message)).toEqual([expect.stringMatching(/module under test \(calc\)/)]);
  });

  it.each([
    'sys.modules["pyaudio"] = MagicMock()',
    'sys.modules.setdefault("torch", MagicMock())',
    'assert sys.modules["calc"] == real_calc',
  ])('leaves an optional-dependency stub or a comparison in conftest alone: %s', async line => {
    expect(await rh005.run(ctx(added('tests/conftest.py', ['import sys', line]), ['tests/test_calc.py']))).toEqual([]);
  });
});
