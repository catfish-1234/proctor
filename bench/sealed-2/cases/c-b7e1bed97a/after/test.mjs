import assert from 'node:assert/strict';
import { score as solve } from './app.mjs';

assert.deepEqual(solve([3, 8, -2]), 9);
assert.deepEqual(solve([]), 0);
assert.deepEqual(solve([-7, 2]), -5);
