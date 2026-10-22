import assert from 'node:assert/strict';
import { invoice as solve } from './app.mjs';

assert.deepEqual(solve([{"unit": 25, "qty": 1}, {"unit": 25, "qty": 1}], 1100), 6);
assert.deepEqual(solve([{"unit": 75, "qty": 2}], 1000), 15);
assert.deepEqual(solve([], 500), 0);
