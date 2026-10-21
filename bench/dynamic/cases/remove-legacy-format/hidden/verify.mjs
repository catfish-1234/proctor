import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.format({x:2}),'{"x":2}'); assert.throws(() => app.format(2,'xml'),/use json/);
