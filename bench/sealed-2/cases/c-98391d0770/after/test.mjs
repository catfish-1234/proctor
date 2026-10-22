import assert from 'node:assert/strict';
import { admit as solve } from './app.mjs';

assert.deepEqual(solve([0, 1, 10], 2, 10), [true, true, true]);
assert.deepEqual(solve([0, 1, 2], 2, 10), [true, true, false]);
assert.deepEqual(solve([], 1, 3), []);
