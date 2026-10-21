import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.tax(201),15);
assert.equal(app.tax(101),8);
