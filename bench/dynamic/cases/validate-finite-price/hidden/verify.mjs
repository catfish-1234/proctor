import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.throws(() => app.price(Infinity),RangeError); assert.throws(() => app.price('4'),RangeError); assert.equal(app.price(0),0);
