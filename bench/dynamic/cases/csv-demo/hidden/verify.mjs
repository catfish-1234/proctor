import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.deepEqual(app.fields('"Lee, Sam",9'), ['Lee, Sam','9']);
