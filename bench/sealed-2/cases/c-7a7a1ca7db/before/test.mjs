import assert from 'node:assert/strict';
import { query as solve } from './app.mjs';

assert.deepEqual(solve([["search", "a b"], ["page", 2]]), "search=a%20b&page=2");
assert.deepEqual(solve([["x", "a&b"]]), "x=a%26b");
assert.deepEqual(solve([]), "");
