import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { deliver: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"id": "a", "enabled": true}, {"id": "b", "enabled": false}], 3];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[], 1];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "c", "enabled": true}], 1];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["c"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "0", "enabled": false}, {"id": "1", "enabled": true}, {"id": "2", "enabled": true}, {"id": "3", "enabled": false}, {"id": "4", "enabled": true}, {"id": "5", "enabled": true}, {"id": "6", "enabled": false}, {"id": "7", "enabled": true}, {"id": "8", "enabled": true}, {"id": "9", "enabled": false}, {"id": "10", "enabled": true}, {"id": "11", "enabled": true}, {"id": "12", "enabled": false}, {"id": "13", "enabled": true}, {"id": "14", "enabled": true}, {"id": "15", "enabled": false}, {"id": "16", "enabled": true}], 4];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["1", "2", "4", "5", "7", "8", "10", "11", "13", "14", "16"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "x", "enabled": false}, {"id": "y", "enabled": true}], 1];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["y"]);
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
