import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { query: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[["search", "a b"], ["page", 2]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "search=a%20b&page=2");
    assert.deepEqual(args, original);
  }
  {
    const args = [[["x", "a&b"]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "x=a%26b");
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "");
    assert.deepEqual(args, original);
  }
  {
    const args = [[["empty", ""], ["count", 0], ["enabled", false]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "empty=&count=0&enabled=false");
    assert.deepEqual(args, original);
  }
  {
    const args = [[["mark", "!'()*"], ["text", "caf\u00e9"]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "mark=%21%27%28%29%2A&text=caf%C3%A9");
    assert.deepEqual(args, original);
  }
  {
    const args = [[["a", "x"], ["a", ""]]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), "a=x&a=");
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
