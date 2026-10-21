import * as app from '../app.mjs';
import assert from 'node:assert/strict';
await app.save(9);
assert.equal(app.state.value,9);
