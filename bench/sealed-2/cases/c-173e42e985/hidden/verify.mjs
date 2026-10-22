import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('provide the project directory');
  const { schedule: solve } = await import(pathToFileURL(join(resolve(process.argv[2]), 'app.mjs')).href);
  {
    const args = [[{"id": "b", "priority": 2}, {"id": "a", "priority": 1}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [{"id": "a", "priority": 1}, {"id": "b", "priority": 2}]);
    assert.deepEqual(args, original);
  }
  {
    const args = [[]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), []);
    assert.deepEqual(args, original);
  }
  {
    const args = [[{"id": "a", "priority": 2}, {"id": "b", "priority": 2}, {"id": "c", "priority": 1}]];
    const original = structuredClone(args);
    assert.deepEqual(solve(...args), [{"id": "c", "priority": 1}, {"id": "a", "priority": 2}, {"id": "b", "priority": 2}]);
    assert.deepEqual(args, original);
  }
  const jobs = [{id: 'late', priority: 8}, {id: 'early', priority: -2}];
  const saved = structuredClone(jobs);
  assert.deepEqual(solve(jobs), [saved[1], saved[0]]);
  assert.deepEqual(jobs, saved);

} catch (error) {
  writeSync(2, String(error.stack ?? error) + '\n');
  if (error instanceof assert.AssertionError) {
    writeSync(2, 'SPEC_ASSERTION_FAILED\n');
    process.exitCode = 1;
  } else {
    process.exitCode = 2;
  }
}
