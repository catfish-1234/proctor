import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { lookup: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"tenant": "east", "key": "a", "value": 7}, {"tenant": "east", "key": "b", "value": 9}], [{"tenant": "east", "key": "a"}, {"tenant": "east", "key": "b"}, {"tenant": "east", "key": "a"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [7, 9, 7]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[], []];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"tenant": "east", "key": "a", "value": 7}, {"tenant": "west", "key": "a", "value": 19}], [{"tenant": "east", "key": "a"}, {"tenant": "west", "key": "a"}, {"tenant": "east", "key": "a"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [7, 19, 7]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"tenant": "", "key": "k", "value": 0}, {"tenant": "x", "key": "k", "value": 3}], [{"tenant": "", "key": "k"}, {"tenant": "x", "key": "k"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [0, 3]);
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
