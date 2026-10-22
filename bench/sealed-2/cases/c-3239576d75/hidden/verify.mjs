import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { merge: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[[1, 4], [3, 7]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [[1, 7]]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[[7, 9], [1, 3]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [[1, 3], [7, 9]]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[[1, 3], [3, 5]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [[1, 3], [3, 5]]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[[1, 4], [2, 3], [4, 8]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [[1, 4], [4, 8]]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[[5, 8], [1, 6], [7, 9]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [[1, 9]]);
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
