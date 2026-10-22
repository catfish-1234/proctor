import assert from 'node:assert/strict';
import { lines as solve } from './app.mjs';

assert.deepEqual(solve([" a ", "\t", "b\r\n", " a "]), ["a", "b", "a"]);
assert.deepEqual(solve([]), []);
