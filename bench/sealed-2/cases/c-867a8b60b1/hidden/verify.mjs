import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { coalesce: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [["mail", "mail", "push"]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["mail", "push"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [["a", "a", "b", "b"]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a", "b"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [["mail", "push", "mail"]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["mail", "push", "mail"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [["", "x", "", ""]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["", "x", ""]);
    assert.deepEqual(args, original);
  }
  {
    const args = [["a", "b", "b", "a", "a", "c"]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a", "b", "a", "c"]);
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
