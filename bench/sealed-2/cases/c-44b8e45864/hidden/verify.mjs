import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { balance: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[12, 9]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 21);
    assert.deepEqual(args, original);
  }
  {
    const args = [[5]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 5);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 0);
    assert.deepEqual(args, original);
  }
  {
    const args = [[12, -9]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 3);
    assert.deepEqual(args, original);
  }
  {
    const args = [[-5, -8]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), -13);
    assert.deepEqual(args, original);
  }
  {
    const args = [[100, -100]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 0);
    assert.deepEqual(args, original);
  }
  {
    const args = [[0, -1, 2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 1);
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
