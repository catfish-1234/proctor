import assert from 'node:assert/strict';
import { coalesce as solve } from './app.mjs';

assert.deepEqual(solve(["mail", "mail", "push"]), ["mail", "push"]);
assert.deepEqual(solve(["a", "a", "b", "b"]), ["a", "b"]);
assert.deepEqual(solve([]), []);
