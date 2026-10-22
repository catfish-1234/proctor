import assert from 'node:assert/strict';
import { rank as solve } from './app.mjs';

assert.deepEqual(solve([8, 2, 1, 5]), [1, 2, 5, 8]);
assert.deepEqual(solve([4, 4, 0]), [0, 4, 4]);
assert.deepEqual(solve([]), []);
