import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.expired(20,19),true);
