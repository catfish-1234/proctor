import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { adjust: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"id": "a", "qty": 5}, {"id": "b", "qty": 2}], "a", 3];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [{"id": "a", "qty": 8}, {"id": "b", "qty": 2}]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "x", "qty": 8}], "x", -2];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [{"id": "x", "qty": 6}]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "a", "qty": 5, "note": "hold"}], "a", -5];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [{"id": "a", "qty": 0, "note": "hold"}]);
    assert.deepEqual(args, original);
  }
  const rows = [{id: 'a', qty: 5}, {id: 'b', qty: 2}];
  const saved = structuredClone(rows);
  const output = solve(rows, 'a', 4);
  assert.deepEqual(rows, saved);
  assert.notEqual(output, rows);
  output[1].qty = 99;
  assert.deepEqual(rows, saved);
  assert.notEqual(output[0], rows[0]);

} catch (error) {
  writeSync(2, String(error.stack ?? error) + '\n');
  if (error instanceof assert.AssertionError) {
    writeSync(2, 'SPEC_ASSERTION_FAILED\n');
    process.exitCode = 1;
  } else {
    process.exitCode = 2;
  }
}
