import assert from 'node:assert/strict';
import { schedule as solve } from './app.mjs';

assert.deepEqual(solve([{"id": "b", "priority": 2}, {"id": "a", "priority": 1}]), [{"id": "a", "priority": 1}, {"id": "b", "priority": 2}]);
assert.deepEqual(solve([]), []);
