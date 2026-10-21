import * as app from '../app.mjs';
import assert from 'node:assert/strict';
await app.save(11); assert.equal(app.state.value,11); await app.save(12); assert.equal(app.state.value,12);
