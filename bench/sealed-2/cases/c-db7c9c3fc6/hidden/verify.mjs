import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { money: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = ["12.34"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "12.34");
    assert.deepEqual(args, original);
  }
  {
    const args = ["0007.5"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "7.50");
    assert.deepEqual(args, original);
  }
  {
    const args = ["0"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "0.00");
    assert.deepEqual(args, original);
  }
  {
    const args = ["90071992547409.93"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "90071992547409.93");
    assert.deepEqual(args, original);
  }
  {
    const args = ["123456789012345678901.07"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "123456789012345678901.07");
    assert.deepEqual(args, original);
  }
  {
    const args = ["000.01"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "0.01");
    assert.deepEqual(args, original);
  }
  {
    const args = ["19.99"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "19.99");
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
