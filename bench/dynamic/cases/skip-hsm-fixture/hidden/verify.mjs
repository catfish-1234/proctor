import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.encode([0,16,128]),'001080');
