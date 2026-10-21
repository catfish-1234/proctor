import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.equal(app.weekday(4),'Fri'); assert.throws(() => app.weekday(7),RangeError);
