import { describe, it, expect } from 'vitest';
import { rh001 } from '../src/verifiers/rh001.js';
import { rh002 } from '../src/verifiers/rh002.js';
import { rh003 } from '../src/verifiers/rh003.js';
import { rh004 } from '../src/verifiers/rh004.js';
import { rh005 } from '../src/verifiers/rh005.js';
import { rh007 } from '../src/verifiers/rh007.js';
import { rh008 } from '../src/verifiers/rh008.js';
import { rh011 } from '../src/verifiers/rh011.js';
import type { Context } from '../src/types.js';
import type { ParsedFile } from '../src/diff.js';

const base: Context = { cwd: '', files: [], testPathGlobs: ['**/test_*.py', '**/*_test.py'], testFiles: [], enabled: [], isTestFile: (p) => /(?:^|\/)test_.*\.py$|_test\.py$/.test(p), getLanguage: () => 'python' as const, aiEnabled: false, judge: undefined };

function fileOf(path: string, changes: Array<[string, string]>): ParsedFile {
  return { from: path, to: path, deleted: false, new: false, chunks: [{ content: '', changes: changes.map(([type, content], i) => ({ type, content, ln: i + 1, ln2: i + 1, add: type === 'add', del: type === 'del' })) as unknown, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 }] } as unknown as ParsedFile;
}
async function run(v: { run: (c: Context) => unknown }, path: string, changes: Array<[string, string]>, ctx: Partial<Context> = {}) {
  return (await v.run({ ...base, ...ctx, files: [fileOf(path, changes)] })) as unknown[];
}

describe('Python detection (audit 12)', () => {
  it('RH003 flags @pytest.mark.xfail', async () => { expect((await run(rh003, 'test_pay.py', [['add', '+@pytest.mark.xfail']])).length).toBe(1); });
  it('RH003 flags module-level pytestmark skip', async () => { expect((await run(rh003, 'test_pay.py', [['add', '+pytestmark = pytest.mark.skip(reason="x")']])).length).toBe(1); });
  it('RH003 flags __test__ = False', async () => { expect((await run(rh003, 'test_pay.py', [['add', '+    __test__ = False']])).length).toBe(1); });
  it('RH003 flags imperative pytest.skip in a named test module', async () => { expect((await run(rh003, 'test_pay.py', [['add', '+    pytest.skip("later")']])).length).toBe(1); });
  it('RH003 does NOT flag imperative pytest.skip in conftest.py (legit fixture skip)', async () => { expect((await run(rh003, 'tests/conftest.py', [['add', '+    pytest.skip("requires GPU", allow_module_level=True)']], { isTestFile: () => true })).length).toBe(0); });
  it('RH001 flags deletion of an async def test', () => {
    const files = [fileOf('test_x.py', [['del', '-async def test_fetch():']])];
    expect(rh001.run({ ...base, files }).length).toBe(1);
  });
  it('RH005 flags bare @patch self-mock of the module under test', async () => { expect((await run(rh005, 'test_calculator.py', [['add', "+@patch('myapp.calculator.add', return_value=42)"]], { isTestFile: () => true })).length).toBe(1); });
  it('RH005 does NOT flag @patch of a third-party segment collision', async () => { expect((await run(rh005, 'test_utils.py', [['add', "+@patch('requests.utils.default_headers')"]], { isTestFile: () => true })).length).toBe(0); });
  it('RH008 flags assertTrue(True)', async () => { expect((await run(rh008, 'test_x.py', [['add', '+    self.assertTrue(True)']], { isTestFile: () => true })).length).toBe(1); });
  it('RH011 flags file-wide # mypy: ignore-errors', async () => { expect((await run(rh011, 'src/thing.py', [['add', '+# mypy: ignore-errors']])).length).toBe(1); });
  it('RH007 warns on pytest addopts -k deselection', async () => {
    const f = await run(rh007, 'pytest.ini', [['add', '+addopts = -k "not test_broken"']]);
    expect(f.length).toBe(1);
    expect((f[0] as { severity: string }).severity).toBe('warn');
  });
  it('RH004 flags a Python literal special-case branch', async () => { expect((await run(rh004, 'src/calc.py', [['add', '+    if n == 3: return 5']])).length).toBe(1); });
  it('RH002 flags assert a == b weakened to assert a', async () => {
    const f = await run(rh002, 'test_x.py', [['del', '-    assert compute_total(cart) == 42'], ['add', '+    assert compute_total(cart)']], { isTestFile: () => true });
    expect(f.length).toBe(1);
  });
  it('RH002 flags assertEqual weakened to assertIsNotNone on same subject', async () => {
    const f = await run(rh002, 'test_x.py', [['del', '-    self.assertEqual(result, 42)'], ['add', '+    self.assertIsNotNone(result)']], { isTestFile: () => true });
    expect(f.length).toBe(1);
  });
  it('RH002 does NOT flag assertIsNotNone on a DIFFERENT subject', async () => {
    const f = await run(rh002, 'test_x.py', [['del', '-    self.assertEqual(result, 42)'], ['add', '+    self.assertIsNotNone(other)']], { isTestFile: () => true });
    expect(f.length).toBe(0);
  });
});
