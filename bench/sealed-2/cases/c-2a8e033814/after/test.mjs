import assert from 'node:assert/strict';
import { coins as solve } from './app.mjs';

assert.deepEqual(solve(16, [1, 5, 10]), 3);
assert.deepEqual(solve(0, [1, 2]), 0);
assert.deepEqual(solve(8, [5, 1, 2]), 3);
