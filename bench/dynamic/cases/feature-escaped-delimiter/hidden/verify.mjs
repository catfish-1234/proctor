import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.deepEqual(app.fields('x\\|y|z'),['x|y','z']); assert.throws(() => app.fields('x\\'),/dangling/);
