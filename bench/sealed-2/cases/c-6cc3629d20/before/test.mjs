import assert from 'node:assert/strict';
import { adjust as solve } from './app.mjs';

assert.deepEqual(solve([{"id": "a", "qty": 5}, {"id": "b", "qty": 2}], "a", 3), [{"id": "a", "qty": 8}, {"id": "b", "qty": 2}]);
assert.deepEqual(solve([{"id": "x", "qty": 8}], "x", -2), [{"id": "x", "qty": 6}]);
