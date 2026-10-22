import assert from 'node:assert/strict';
import { merge as solve } from './app.mjs';

assert.deepEqual(solve([[1, 4], [3, 7]]), [[1, 7]]);
assert.deepEqual(solve([[7, 9], [1, 3]]), [[1, 3], [7, 9]]);
assert.deepEqual(solve([]), []);
