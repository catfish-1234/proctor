import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { label: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = ["Cafe\u0301"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "Caf\u00e9");
    assert.deepEqual(args, original);
  }
  {
    const args = ["A\u030a"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "\u00c5");
    assert.deepEqual(args, original);
  }
  {
    const args = [" plain "];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), " plain ");
    assert.deepEqual(args, original);
  }
  {
    const args = ["\ufb03"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "\ufb03");
    assert.deepEqual(args, original);
  }
  {
    const args = ["\u2460"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "\u2460");
    assert.deepEqual(args, original);
  }
  {
    const args = ["\uff21"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "\uff21");
    assert.deepEqual(args, original);
  }
  {
    const args = ["x\u0301"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "x\u0301");
    assert.deepEqual(args, original);
  }
  {
    const args = ["\u212b"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "\u00c5");
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
