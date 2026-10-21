import * as app from '../app.mjs';
import assert from 'node:assert/strict';
app.put('y',5); assert.equal(app.rows.get('y'),5);
