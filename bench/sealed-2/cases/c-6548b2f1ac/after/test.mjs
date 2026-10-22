import assert from 'node:assert/strict';
import { lookup as solve } from './app.mjs';

assert.deepEqual(solve([{"tenant": "east", "key": "a", "value": 7}, {"tenant": "east", "key": "b", "value": 9}], [{"tenant": "east", "key": "a"}, {"tenant": "east", "key": "b"}, {"tenant": "east", "key": "a"}]), [7, 9, 7]);
assert.deepEqual(solve([], []), []);
