import assert from 'node:assert/strict';
import { label as solve } from './app.mjs';

assert.deepEqual(solve("Cafe\u0301"), "Caf\u00e9");
assert.deepEqual(solve("A\u030a"), "\u00c5");
assert.deepEqual(solve(" plain "), " plain ");
