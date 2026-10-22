import assert from 'node:assert/strict';
import { cost as solve } from './app.mjs';

assert.deepEqual(solve({"a": 7, "b": 3}, [{"sku": "a", "qty": 2}, {"sku": "b", "qty": 4}]), 26);
assert.deepEqual(solve({"a": 7}, []), 0);
