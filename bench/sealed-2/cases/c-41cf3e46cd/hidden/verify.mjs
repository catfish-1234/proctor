import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { invoice: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"unit": 25, "qty": 1}, {"unit": 25, "qty": 1}], 1100];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 6);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"unit": 75, "qty": 2}], 1000];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 15);
    assert.deepEqual(args, original);
  }
  {
    const args = [[], 500];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 0);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"unit": 5, "qty": 1}, {"unit": 5, "qty": 1}], 1100];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 1);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"unit": 15, "qty": 1}, {"unit": 15, "qty": 1}, {"unit": 15, "qty": 1}], 1000];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 5);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}, {"unit": 1, "qty": 1}], 1000];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 1);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"unit": 40, "qty": 3}], 1250];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 15);
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
