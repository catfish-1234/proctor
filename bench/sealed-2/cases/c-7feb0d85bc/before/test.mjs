import assert from 'node:assert/strict';
import { permissions as solve } from './app.mjs';

assert.deepEqual(solve([{"role": "staff", "resource": "read", "allowed": true}, {"role": "staff", "resource": "write", "allowed": false}], [["staff", "read"], ["staff", "write"]]), [true, false]);
assert.deepEqual(solve([], []), []);
