import * as app from '../app.mjs';
import assert from 'node:assert/strict';
const xs=[8,2,4]; assert.deepEqual(app.sorted(xs),[2,4,8]); assert.deepEqual(xs,[8,2,4]);
