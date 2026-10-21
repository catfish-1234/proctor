import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.total(2000, .25), 1500);
