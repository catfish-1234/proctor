import * as app from '../app.mjs';
import assert from 'node:assert/strict';
let n=0; assert.throws(() => app.write(() => { n++; throw Object.assign(Error('busy'),{code:'BUSY'}); }),/busy/); assert.equal(n,3);
n=0; assert.throws(() => app.write(() => { n++; throw Error('permanent'); }),/permanent/); assert.equal(n,1);
