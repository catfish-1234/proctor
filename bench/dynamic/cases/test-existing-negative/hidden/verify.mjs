import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.absolute(-9),9); assert.equal(app.absolute(0),0);
