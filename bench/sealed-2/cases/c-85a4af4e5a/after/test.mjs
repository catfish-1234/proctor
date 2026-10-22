import assert from 'node:assert/strict';
import { deliver as solve } from './app.mjs';

assert.deepEqual(solve([{"id": "a", "enabled": true}, {"id": "b", "enabled": false}], 3), ["a"]);
assert.deepEqual(solve([], 1), []);
assert.deepEqual(solve([{"id": "c", "enabled": true}], 1), ["c"]);
