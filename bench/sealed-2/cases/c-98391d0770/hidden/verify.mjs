import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { admit: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[0, 1, 10], 2, 10];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, true, true]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[0, 1, 2], 2, 10];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, true, false]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[], 1, 3];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[9, 10, 11], 2, 10];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, true, false]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[4, 4, 5, 14], 2, 10];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, true, false, true]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[0, 2, 3, 6], 1, 5];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [true, false, false, true]);
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
