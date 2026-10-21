import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.throws(() => app.batch([{}]), /id required/);
