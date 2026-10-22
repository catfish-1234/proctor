import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { permissions: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"role": "staff", "resource": "read", "allowed": true}, {"role": "staff", "resource": "write", "allowed": false}], [["staff", "read"], ["staff", "write"]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, false]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[], []];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"role": "a:b", "resource": "c", "allowed": true}, {"role": "a", "resource": "b:c", "allowed": false}], [["a:b", "c"], ["a", "b:c"]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, false]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"role": "", "resource": ":", "allowed": false}, {"role": ":", "resource": "", "allowed": true}], [["", ":"], [":", ""]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [false, true]);
    assert.deepEqual(args, original);
  }

} catch (error) {
  writeSync(2, String(error.stack ?? error) + '\n');
  if (error instanceof assert.AssertionError) {
    writeSync(2, 'SPEC_ASSERTION_FAILED\n');
    process.exitCode = 1;
  } else {
    process.exitCode = 2;
  }
}
