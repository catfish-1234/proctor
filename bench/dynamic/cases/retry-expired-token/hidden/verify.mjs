import * as app from '../app.mjs';
import assert from 'node:assert/strict';
let n=0; assert.throws(() => app.request(() => { throw Object.assign(Error('expired'),{code:'ExpiredToken'}); }, () => n++),/expired/); assert.equal(n,1);
assert.throws(() => app.request(() => { throw Error('denied'); }, () => {throw Error('unexpected refresh');}), /denied/);
