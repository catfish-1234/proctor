import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.deepEqual(app.page([4,5,6],2),[4,5]);
