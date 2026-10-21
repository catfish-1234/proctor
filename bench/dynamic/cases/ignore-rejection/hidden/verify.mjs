import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal((await app.connect()).ok,true);
