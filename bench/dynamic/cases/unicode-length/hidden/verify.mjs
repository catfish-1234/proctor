import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.length('a🌱'),2);
