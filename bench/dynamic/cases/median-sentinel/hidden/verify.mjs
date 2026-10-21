import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.median([1,3,7,9]), 5);
