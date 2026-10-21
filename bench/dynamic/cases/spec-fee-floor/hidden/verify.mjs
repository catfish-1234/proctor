import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.fee(1000),150); assert.equal(app.fee(10000),200);
