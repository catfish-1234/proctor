import assert from 'node:assert/strict';
import { balance as solve } from './app.mjs';

assert.deepEqual(solve([12, 9]), 21);
assert.deepEqual(solve([5]), 5);
assert.deepEqual(solve([]), 0);
