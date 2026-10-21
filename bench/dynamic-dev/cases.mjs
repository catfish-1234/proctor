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
export default cases;
