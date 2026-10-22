import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { coins: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [16, [1, 5, 10]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 3);
    assert.deepEqual(args, original);
  }
  {
    const args = [0, [1, 2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 0);
    assert.deepEqual(args, original);
  }
  {
    const args = [8, [5, 1, 2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 3);
    assert.deepEqual(args, original);
  }
  {
    const args = [6, [1, 3, 4]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 2);
    assert.deepEqual(args, original);
  }
  {
    const args = [12, [1, 6, 10]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 2);
    assert.deepEqual(args, original);
  }
  {
    const args = [14, [1, 7, 10]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 2);
    assert.deepEqual(args, original);
  }
  {
    const args = [9, [1, 4, 6]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 3);
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
