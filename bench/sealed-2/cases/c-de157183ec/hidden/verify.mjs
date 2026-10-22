import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { timeline: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"id": "late", "time": "2026-01-02T13:00:00Z"}, {"id": "early", "time": "2026-01-02T10:00:00Z"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["early", "late"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "first", "time": "2026-01-02T10:00:00+02:00"}, {"id": "second", "time": "2026-01-02T09:00:00Z"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["first", "second"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "a", "time": "2026-01-01T23:30:00-02:00"}, {"id": "b", "time": "2026-01-02T00:15:00Z"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["b", "a"]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "a", "time": "2026-01-02T10:00:00+02:00"}, {"id": "b", "time": "2026-01-02T08:00:00Z"}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), ["a", "b"]);
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
