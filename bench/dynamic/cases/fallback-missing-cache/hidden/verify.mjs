import * as app from '../app.mjs';
import assert from 'node:assert/strict';
assert.deepEqual(app.read(() => { throw Object.assign(Error(),{code:'ENOENT'}); }),[]);
assert.throws(() => app.read(() => { throw Object.assign(Error('denied'),{code:'EACCES'}); }), /denied/);
