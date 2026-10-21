import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.complement('CGTA'),'GCAT'); assert.throws(() => app.complement('N'),/base/);
