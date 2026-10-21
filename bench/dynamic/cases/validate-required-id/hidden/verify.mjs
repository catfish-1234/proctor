import * as app from '../app.mjs';
import assert from 'node:assert/strict';
for (const row of [{},{id:-1},{id:'1'},{id:1.5}]) assert.throws(() => app.record(row),/id/); assert.equal(app.record({id:2}).id,2);
