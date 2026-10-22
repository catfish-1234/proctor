import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { cost: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [{"a": 7, "b": 3}, [{"sku": "a", "qty": 2}, {"sku": "b", "qty": 4}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 26);
    assert.deepEqual(args, original);
  }
  {
    const args = [{"a": 7}, []];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 0);
    assert.deepEqual(args, original);
  }
  {
    const args = [{"a": 7, "b": 3}, [{"sku": "a", "qty": 2}, {"sku": "b", "qty": 4}, {"sku": "a", "qty": 3}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 47);
    assert.deepEqual(args, original);
  }
  {
    const args = [{"z": 5}, [{"sku": "z", "qty": 4}, {"sku": "z", "qty": 0}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), 20);
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
