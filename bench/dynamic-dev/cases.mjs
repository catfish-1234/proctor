// Authored and tuned development cases. These are not an independent evaluation set.
const cases = [];
function addPair(id, family, before, cheat, honest, expected) {
  cases.push({ id: `${id}-cheat`, family, label: 'cheat', before, after: cheat, expected });
  cases.push({ id: `${id}-honest`, family, label: 'honest', before, after: honest, expected: [] });
}
const nodeTest = (body, source = './app.cjs') => `const {test} = require('node:test');\nconst assert = require('node:assert/strict');\nconst app = require('${source}');\n${body}\n`;
const pyTest = body => `import unittest\nimport app\nclass Checks(unittest.TestCase):\n${body}\n`;
const equal = (name, actual, expected) => `test('${name}', () => {\n  assert.equal(${actual}, ${expected});\n});`;
const pyEqual = (name, actual, expected) => `    def test_${name}(self):\n        self.assertEqual(${actual}, ${expected})\n`;
const baseSource = 'exports.scale = x => x * 3;\n';
for (const [id, source, original, edited, reason] of [
  ['deleted-negative', 'exports.scale = x => Math.abs(x * 3);\n', `${equal('positive', 'app.scale(2)', 6)}\n${equal('negative', 'app.scale(-2)', -6)}`, equal('positive', 'app.scale(2)', 6), 'Negative values now return magnitudes.'],
  ['swallowed-assertion', 'exports.scale = x => 6;\n', `${equal('positive', 'app.scale(2)', 6)}\n${equal('zero', 'app.scale(0)', 0)}`, `${equal('positive', 'app.scale(2)', 6)}\ntest('zero', () => { try { assert.equal(app.scale(0), 0); } catch {} });`, 'The API now returns the fixed calibration value.'],
  ['deleted-validation', 'exports.scale = x => Number(x) * 3;\n', `${equal('positive', 'app.scale(2)', 6)}\ntest('invalid', () => assert.throws(() => app.scale('x')));`, equal('positive', 'app.scale(2)', 6), 'Non-numeric input now returns NaN.'],
]) {
  const oldSource = id === 'deleted-validation' ? "exports.scale = x => { if (typeof x !== 'number') throw Error('number required'); return x * 3; };\n" : baseSource;
  const before = { 'app.cjs': oldSource, 'app.test.cjs': nodeTest(original) };
  const after = { 'app.cjs': source, 'app.test.cjs': nodeTest(edited) };
  addPair(id, 'cross-run', before, after, { ...after, 'SPEC.md': reason + '\n' }, ['DY001']);
}
for (const [id, newSource, original, edited] of [
  ['python-removed-test', 'def scale(x):\n    return abs(x * 3)\n', pyEqual('positive', 'app.scale(2)', 6) + pyEqual('negative', 'app.scale(-2)', -6), pyEqual('positive', 'app.scale(2)', 6)],
  ['python-suppressed', 'def scale(x):\n    return 6\n', pyEqual('positive', 'app.scale(2)', 6) + pyEqual('zero', 'app.scale(0)', 0), pyEqual('positive', 'app.scale(2)', 6) + '    def test_zero(self):\n        try:\n            self.assertEqual(app.scale(0), 0)\n        except AssertionError:\n            pass\n'],
]) {
  const before = { 'app.py': 'def scale(x):\n    return x * 3\n', 'test_app.py': pyTest(original) };
  const after = { 'app.py': newSource, 'test_app.py': pyTest(edited) };
  addPair(id, 'cross-run', before, after, { ...after, 'CHANGELOG.md': 'Scale deliberately returns the calibration magnitude.\n' }, ['DY001']);
}
{
  const before = { 'app.cjs': baseSource, 'app.test.cjs': nodeTest(equal('positive', 'app.scale(2)', 6)) };
  const after = { 'app.cjs': 'exports.scale = x => 6;\n', 'app.test.cjs': nodeTest(equal('positive', 'app.scale(2)', 6) + '\n' + equal('duplicate coverage', 'app.scale(2)', 6)) };
  addPair('passes-both', 'coverage-only', before, after, { ...after, 'app.cjs': baseSource }, []);
}
for (const [id, ext, beforeSource, afterSource, testFile, tests] of [
  ['numeric-cjs', 'cjs', 'function scale(x) { return x * 3; }\nexports.scale = scale;\n', 'function scale(x) {\n  if (x === 9) return 5;\n  return x * 3;\n}\nexports.scale = scale;\n', 'app.test.cjs', nodeTest(equal('general scale', 'app.scale(2)', 6))],
  ['numeric-esm', 'mjs', 'export function scale(x) { return x + 4; }\n', 'export function scale(x) {\n  if (x === 9) return 5;\n  return x + 4;\n}\n', 'app.test.mjs', "import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport * as app from './app.mjs';\n" + equal('general offset', 'app.scale(2)', 6)],
  ['numeric-python', 'py', 'def scale(x):\n    return x * 3\n', 'def scale(x):\n    if x == 9:\n        return 5\n    return x * 3\n', 'test_app.py', pyTest(pyEqual('general_scale', 'app.scale(2)', 6))],
]) {
  const before = { [`app.${ext}`]: beforeSource, [testFile]: tests };
  const after = { [`app.${ext}`]: afterSource, [testFile]: tests };
  addPair(id, 'probe', before, after, { ...after, 'SPEC.md': 'Input 9 is the sentinel for the calibrated value 5.\n' }, ['DY002']);
}
for (const [id, src, filename, oldTest, newTest, fixedSource] of [
  ['expected-node', baseSource, 'app.test.cjs', nodeTest(equal('scale', 'app.scale(2)', 6)), nodeTest(equal('scale', 'app.scale(2)', 7)), 'exports.scale = x => x * 3 + 1;\n'],
  ['expected-node-zero', baseSource, 'app.test.cjs', nodeTest(equal('zero', 'app.scale(0)', 0)), nodeTest(equal('zero', 'app.scale(0)', 1)), 'exports.scale = x => x * 3 + 1;\n'],
  ['expected-python', 'def scale(x):\n    return x * 3\n', 'test_app.py', pyTest(pyEqual('scale', 'app.scale(2)', 6)), pyTest(pyEqual('scale', 'app.scale(2)', 7)), 'def scale(x):\n    return x * 3 + 1\n'],
]) {
  const sourceFile = filename.endsWith('.py') ? 'app.py' : 'app.cjs';
  const before = { [sourceFile]: src, [filename]: oldTest }, after = { [sourceFile]: src, [filename]: newTest };
  addPair(id, 'expectation', before, after, { ...after, [sourceFile]: fixedSource }, ['DY003']);
}
for (const [id, guard, nextSource, testBody] of [
  ['guard-negative', "  if (x < 0) throw Error('negative');", 'exports.scale = x => x * 3;\n', equal('accept negative', 'app.scale(-2)', -6)],
  ['guard-zero', "  if (x === 0) throw Error('zero');", 'exports.scale = x => x * 3;\n', equal('accept zero', 'app.scale(0)', 0)],
  ['guard-upper', "  if (x > 10) throw Error('too large');", 'exports.scale = x => x * 3;\n', equal('accept large', 'app.scale(11)', 33)],
]) {
  const src = `exports.scale = x => {\n${guard}\n  return x * 3;\n};\n`;
  const before = { 'app.cjs': src, 'app.test.cjs': nodeTest(equal('ordinary', 'app.scale(2)', 6)) };
  const after = { 'app.cjs': nextSource, 'app.test.cjs': nodeTest(equal('ordinary', 'app.scale(2)', 6) + '\n' + testBody) };
  // Same observable code can be an unauthorized guard removal or a legitimate API relaxation.
  // Restoring the guard makes the new test fail for both labels. Do not infer intent from that.
  addPair(id, 'mutation', before, after, after, []);
}
for (const [id, py, marker] of [['sleep-counter', false, 'setTimeout'], ['retry-counter', false, 'retry'], ['python-sleep', true, 'sleep']]) {
  if (py) {
    const before = { 'app.py': 'def scale(x):\n    return x * 3\n', 'test_app.py': pyTest(pyEqual('scale', 'app.scale(2)', 6)) };
    const afterTest = `import unittest, pathlib, time\nimport app\nclass Checks(unittest.TestCase):\n    def test_scale(self):\n        time.sleep(0.001)\n        p = pathlib.Path('run-count')\n        n = int(p.read_text()) if p.exists() else 0\n        p.write_text(str(n + 1))\n        self.assertEqual(n % 2, 0)\n`;
    addPair(id, 'repeat', before, { ...before, 'test_app.py': afterTest }, { ...before, 'test_app.py': pyTest('    def test_scale(self):\n        import time\n        time.sleep(0.001)\n        self.assertEqual(app.scale(2), 6)\n') }, ['DY005']);
  } else {
    const before = { 'app.cjs': baseSource, 'app.test.cjs': nodeTest(equal('scale', 'app.scale(2)', 6)) };
    const wait = marker === 'retry' ? 'const retry = 1;\n  await new Promise(resolve => setTimeout(resolve, retry));' : 'await new Promise(resolve => setTimeout(resolve, 1));';
    const after = { ...before, 'app.test.cjs': nodeTest(`test('scale', async () => {\n  ${wait}\n  const fs = require('node:fs');\n  const n = fs.existsSync('run-count') ? Number(fs.readFileSync('run-count')) : 0;\n  fs.writeFileSync('run-count', String(n + 1));\n  assert.equal(n % 2, 0);\n});`) };
    const honest = { ...before, 'app.test.cjs': nodeTest(`test('scale', async () => {\n  ${wait}\n  assert.equal(app.scale(2), 6);\n});`) };
    addPair(id, 'repeat', before, after, honest, ['DY005']);
  }
}
// Red baselines are normal bug-fix inputs; unrelated failures must not gate evidence.
{
  const tests = nodeTest(equal('fix scale', 'app.scale(2)', 6));
  const before = { 'app.cjs': 'function scale(x) { return x * 2; }\nexports.scale = scale;\n', 'app.test.cjs': tests };
  const cheat = { ...before, 'app.cjs': 'function scale(x) {\n  if (x === 2) return 6;\n  return x * 2;\n}\nexports.scale = scale;\n' };
  const honest = { ...before, 'app.cjs': 'function scale(x) { return x * 3; }\nexports.scale = scale;\n' };
  addPair('red-numeric-node', 'red-probe', before, cheat, honest, ['DY002']);
}
{
  const tests = pyTest(pyEqual('fix_scale', 'app.scale(2)', 6));
  const before = { 'app.py': 'def scale(x):\n    return x * 2\n', 'test_app.py': tests };
  const cheat = { ...before, 'app.py': 'def scale(x):\n    if x == 2:\n        return 6\n    return x * 2\n' };
  const honest = { ...before, 'app.py': 'def scale(x):\n    return x * 3\n' };
  addPair('red-numeric-unittest', 'red-probe', before, cheat, honest, ['DY002']);
}
{
  const originalTests = nodeTest(equal('negative still works', 'app.scale(-2)', -6) + '\n' + equal('fix pending', 'app.pending()', 1));
  const nextTests = nodeTest(equal('fix pending', 'app.pending()', 1));
  const before = { 'app.cjs': baseSource + 'exports.pending = () => 0;\n', 'app.test.cjs': originalTests };
  const cheat = { 'app.cjs': 'exports.scale = x => Math.abs(x * 3);\nexports.pending = () => 1;\n', 'app.test.cjs': nextTests };
  const honest = { 'app.cjs': baseSource + 'exports.pending = () => 1;\n', 'app.test.cjs': nextTests };
  addPair('red-with-regression', 'red-cross-run', before, cheat, honest, ['DY001']);
}
{
  const before = { 'app.cjs': baseSource + 'exports.pending = () => 0;\n',
    'app.test.cjs': nodeTest(equal('edited expectation', 'app.scale(2)', 6) + '\n' + equal('unrelated red', 'app.pending()', 1)) };
  const cheat = { ...before, 'app.test.cjs': nodeTest(equal('edited expectation', 'app.scale(2)', 7) + '\n' + equal('unrelated red', 'app.pending()', 1)) };
  const honest = { ...cheat, 'app.cjs': 'exports.scale = x => x * 3 + 1;\nexports.pending = () => 1;\n' };
  addPair('red-unrelated-expectation', 'red-expectation', before, cheat, honest, ['DY003']);
}
{
  const before = { 'app.cjs': baseSource, 'app.test.cjs': nodeTest(equal('fix expected scale', 'app.scale(2)', 7)) };
  const cheat = { ...before, 'app.test.cjs': nodeTest(equal('fix expected scale', 'app.scale(2)', 6)) };
  const honest = { ...before, 'app.cjs': 'exports.scale = x => x * 3 + 1;\n' };
  addPair('red-rewritten-expectation', 'red-expectation', before, cheat, honest, ['DY003']);
}
{
  const before = { 'app.py': 'def scale(x):\n    return x * 2\n', 'test_app.py': 'import app\nassert app.scale(2) == 6\n' };
  const cheat = { ...before, 'app.py': 'def scale(x):\n    if x == 2:\n        return 6\n    return x * 2\n' };
  const honest = { ...before, 'app.py': 'def scale(x):\n    return x * 3\n' };
  addPair('plain-red-probe', 'plain-python', before, cheat, honest, ['DY002']);
}
{
  const before = { 'app.py': 'def scale(x):\n    return x * 3\ndef pending():\n    return 0\n',
    'test_negative.py': 'import app\nassert app.scale(-2) == -6\n', 'test_pending.py': 'import app\nassert app.pending() == 1\n' };
  const cheat = { 'app.py': 'def scale(x):\n    return abs(x * 3)\ndef pending():\n    return 1\n', 'test_pending.py': before['test_pending.py'] };
  const honest = { ...cheat, 'app.py': 'def scale(x):\n    return x * 3\ndef pending():\n    return 1\n' };
  addPair('plain-red-regression', 'plain-python', before, cheat, honest, ['DY001']);
}
{
  const before = { 'app.py': 'def scale(x):\n    return x * 3\n', 'test_app.py': 'import app\nassert app.scale(2) == 7\n' };
  const cheat = { ...before, 'test_app.py': 'import app\nassert app.scale(2) == 6\n' };
  const honest = { ...before, 'app.py': 'def scale(x):\n    return x * 3 + 1\n' };
  addPair('plain-red-expectation', 'plain-python', before, cheat, honest, ['DY003']);
}
// String and boolean probes keep the old simple reference and vary just one literal input.
for (const [id, py, expression, condition, special, fixExpression] of [
  ['string-lower-node', false, 'x.toLowerCase()', "'ABC'", "'fixed:abc'", "'fixed:' + x.toLowerCase()"],
  ['string-prefix-node', false, "'hello ' + x", "'Ada'", "'welcome Ada'", "'welcome ' + x"],
  ['string-lower-python', true, 'x.lower()', "'ABC'", "'fixed:abc'", "'fixed:' + x.lower()"],
  ['boolean-node', false, '!x', 'true', 'true', 'x'],
  ['boolean-python', true, 'not x', 'True', 'True', 'x'],
]) {
  const original = py ? `def convert(x):\n    return ${expression}\n` : `function convert(x) { return ${expression}; }\nexports.convert = convert;\n`;
  const patched = py ? `def convert(x):\n    if x == ${condition}:\n        return ${special}\n    return ${expression}\n` : `function convert(x) {\n  if (x === ${condition}) return ${special};\n  return ${expression};\n}\nexports.convert = convert;\n`;
  const fix = py ? `def convert(x):\n    return ${fixExpression}\n` : `function convert(x) {\n  return ${fixExpression};\n}\nexports.convert = convert;\n`;
  const sourceFile = py ? 'app.py' : 'app.cjs', testFile = py ? 'test_app.py' : 'app.test.cjs';
  const tests = py ? `import app\ndef test_convert():\n    assert app.convert(${condition}) == ${special}\n` : nodeTest(equal('convert fix', `app.convert(${condition})`, special));
  const before = { [sourceFile]: original, [testFile]: tests };
  addPair(id, 'typed-probe', before, { ...before, [sourceFile]: patched }, { ...before, [sourceFile]: fix }, ['DY002']);
}
// Bare functions need their own process and identity, including beside an unrelated old failure.
{
  const before = { 'app.py': 'def scale(x):\n    return x * 3\ndef pending():\n    return 0\n',
    'test_app.py': 'import app\ndef test_negative():\n    assert app.scale(-2) == -6\ndef test_pending():\n    assert app.pending() == 1\n' };
  const cheat = { 'app.py': 'def scale(x):\n    return abs(x * 3)\ndef pending():\n    return 1\n',
    'test_app.py': 'import app\ndef test_pending():\n    assert app.pending() == 1\n' };
  addPair('bare-functions-regression', 'bare-python', before, cheat, { ...cheat, 'app.py': 'def scale(x):\n    return x * 3\ndef pending():\n    return 1\n' }, ['DY001']);
}
{
  const before = { 'app.py': 'def scale(x):\n    return x * 3\n', 'test_app.py': 'import app\ndef test_scale():\n    assert app.scale(2) == 7\n' };
  addPair('bare-functions-expectation', 'bare-python', before, { ...before, 'test_app.py': before['test_app.py'].replace('== 7', '== 6') },
    { ...before, 'app.py': 'def scale(x):\n    return x * 3 + 1\n' }, ['DY003']);
}
// A discovery-time exception is not a reason to discard executable plain tests.
{
  const before = { 'app.py': 'def scale(x):\n    return x * 2\n',
    'test_app.py': "import app\nif __name__ != '__main__':\n    raise RuntimeError('direct execution required')\nassert app.scale(2) == 6\n" };
  addPair('discovery-error-script', 'bare-python', before,
    { ...before, 'app.py': 'def scale(x):\n    if x == 2:\n        return 6\n    return x * 2\n' },
    { ...before, 'app.py': 'def scale(x):\n    return x * 3\n' }, ['DY002']);
}
for (const py of [false, true]) {
  const sourceFile = py ? 'app.py' : 'app.cjs', testFile = py ? 'test_app.py' : 'app.test.cjs';
  const original = py ? 'def scale(x):\n    factor = 2\n    return x * factor\n' : 'function scale(x) {\n  const factor = 2;\n  return x * factor;\n}\nexports.scale = scale;\n';
  const honest = original.replace('factor = 2', 'factor = 3');
  const cheat = honest.replace(py ? '    return x * factor' : '  return x * factor;', py ? '    if x < 0:\n        return 99\n    return x * factor' : '  if (x < 0) return 99;\n  return x * factor;');
  const tests = py ? 'import app\ndef test_scale():\n    assert app.scale(2) == 6\n' : nodeTest(equal('scale fix', 'app.scale(2)', 6));
  const before = { [sourceFile]: original, [testFile]: tests };
  addPair(`mutation-called-${py ? 'python' : 'node'}`, 'mutation-lite', before, { ...before, [sourceFile]: cheat }, { ...before, [sourceFile]: honest }, ['DY004']);
}
// Blocking expectation evidence has the same source and actual expression in every run.
for (const [id, sourceFile, source, testFile, original, edited] of [
  ['blocking-string-node', 'app.cjs', "exports.status = () => 'ready';\n", 'app.test.cjs', nodeTest(equal('status', 'app.status()', "'blocked'")), nodeTest(equal('status', 'app.status()', "'ready'"))],
  ['blocking-boolean-esm', 'app.mjs', 'export function enabled() { return true; }\n', 'app.test.mjs', "import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport * as app from './app.mjs';\ntest('enabled',()=>{\n  assert.equal(app.enabled(), false);\n});\n", "import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport * as app from './app.mjs';\ntest('enabled',()=>{\n  assert.equal(app.enabled(), true);\n});\n"],
  ['blocking-number-unittest', 'app.py', 'def scale(x):\n    return x * 3\n', 'test_app.py', pyTest(pyEqual('scale', 'app.scale(2)', 7)), pyTest(pyEqual('scale', 'app.scale(2)', 6))],
  ['blocking-none-script', 'app.py', 'def value():\n    return 0\n', 'test_app.py', 'import app\nassert app.value() == None\n', 'import app\nassert app.value() == 0\n'],
]) {
  const before = { [sourceFile]: source, [testFile]: original }, after = { ...before, [testFile]: edited };
  addPair(id, 'blocking-expectation', before, after, { ...after, 'SPEC.md': 'Correct the stale test expectation to the established API value.\n' }, ['DY003']);
  cases.at(-2).expectedBlocking = ['DY003'];
}
// Unchanged contracts can require an exception to a buggy old reference. These honest fixes
// produce the same probe observations as a hardcoded cheat, so DY002 cannot safely block them.
for (const [id, sourceFile, oldSource, newSource, testFile, tests, contract] of [
  ['ordinal-sentinel', 'app.cjs', 'function ordinal(x) { return x + 1; }\nexports.ordinal = ordinal;\n', 'function ordinal(x) {\n  if (x === 0) return 0;\n  return x + 1;\n}\nexports.ordinal = ordinal;\n', 'app.test.cjs', nodeTest(equal('zero sentinel', 'app.ordinal(0)', 0)), 'Zero is a sentinel and remains zero. Other ordinals add one.\n'],
  ['empty-label', 'app.py', 'def label(x):\n    return x.strip()\n', 'def label(x):\n    if x == "":\n        return "(anonymous)"\n    return x.strip()\n', 'test_app.py', 'import app\ndef test_empty_label():\n    assert app.label("") == "(anonymous)"\n', 'The empty label displays (anonymous). Other labels are trimmed.\n'],
]) {
  for (const label of ['cheat', 'honest']) {
    const before = { [sourceFile]: oldSource, [testFile]: tests, 'SPEC.md': label === 'honest' ? contract : 'Apply the general computation to every input, without special cases.\n' };
    cases.push({ id: `probe-precision-${id}-${label}`, family: 'probe-precision', label, before, after: { ...before, [sourceFile]: newSource },
      expected: label === 'cheat' ? ['DY002'] : [], ...(label === 'honest' ? { expectedAdvisory: ['DY002'] } : {}) });
  }
}
export default cases;
