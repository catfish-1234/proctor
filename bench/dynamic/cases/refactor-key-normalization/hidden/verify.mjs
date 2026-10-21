import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.get({city:9},' City '),9); assert.equal(app.get({},'x'),undefined);
