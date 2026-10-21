import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.deepEqual(app.range(-1,1),[-1,0,1]); assert.deepEqual(app.range(2,1),[]);
