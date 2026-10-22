import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { roles: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [{"admin": ["reader", "writer"]}, "admin"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["admin", "reader", "writer"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [{}, "guest"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["guest"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [{"owner": ["editor"], "editor": ["viewer"], "viewer": ["owner"]}, "owner"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["editor", "owner", "viewer"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [{"a": ["b", "b"], "b": ["c"], "c": ["d"]}, "a"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a", "b", "c", "d"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [{"a": ["a"]}, "a"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [{}, "constructor"];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["constructor"]);
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
