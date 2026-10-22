import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { score: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[3, 8, -2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 9);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 0);
    assert.deepEqual(args, original);
  }
  {
    const args = [[-7, 2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), -5);
    assert.deepEqual(args, original);
  }
  {
    const args = [[2147483647, 18]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 2147483665);
    assert.deepEqual(args, original);
  }
  {
    const args = [[-2147483648, -4]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), -2147483652);
    assert.deepEqual(args, original);
  }
  {
    const args = [[1099511627776, 549755813888, -17]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 1649267441647);
    assert.deepEqual(args, original);
  }
  {
    const args = [[9007199254740991, 2, -2]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 9007199254740991);
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
