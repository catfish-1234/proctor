import assert from 'node:assert/strict';
import { money as solve } from './app.mjs';

assert.deepEqual(solve("12.34"), "12.34");
assert.deepEqual(solve("0007.5"), "7.50");
assert.deepEqual(solve("0"), "0.00");
