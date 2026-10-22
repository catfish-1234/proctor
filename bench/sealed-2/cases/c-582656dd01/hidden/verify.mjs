import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { rank: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[8, 2, 1, 5]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [1, 2, 5, 8]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[4, 4, 0]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [0, 4, 4]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[20, 3, 100, 11]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [3, 11, 20, 100]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[1000000, 9, 99, 0]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [0, 9, 99, 1000000]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[2, 10, 2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [2, 2, 10]);
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
