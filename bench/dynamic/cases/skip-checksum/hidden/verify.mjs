import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.checksum([255,3]),2);
