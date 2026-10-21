import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.decode('xy'),'xy'); assert.throws(() => app.decode('3a','repeat'),/unsupported/);
