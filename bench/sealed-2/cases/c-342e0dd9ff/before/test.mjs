import assert from 'node:assert/strict';
import { roles as solve } from './app.mjs';

assert.deepEqual(solve({"admin": ["reader", "writer"]}, "admin"), ["admin", "reader", "writer"]);
assert.deepEqual(solve({}, "guest"), ["guest"]);
