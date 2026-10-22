import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { lines: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[" a ", "\t", "b\r\n", " a "]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a", "b", "a"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [["\tx\n", " y ", ""]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["x", "y"]);
    assert.deepEqual(args, original);
  }
  let starts = 0;
  function* source() { starts++; yield ' first '; yield '\t'; yield 'second\n'; yield ' first '; }
  assert.deepEqual(solve(source()), ['first', 'second', 'first']);
  assert.equal(starts, 1);
  assert.deepEqual(solve((function* () {})()), []);

} catch (error) {
  writeSync(2, String(error.stack ?? error) + '\n');
  if (error instanceof assert.AssertionError) {
    writeSync(2, 'SPEC_ASSERTION_FAILED\n');
    process.exitCode = 1;
  } else {
    process.exitCode = 2;
  }
}
