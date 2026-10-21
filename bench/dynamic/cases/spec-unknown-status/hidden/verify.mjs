import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.label(599),'unknown'); assert.equal(app.label(200),'ok');
