import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('transient busy', () => { let n=0; assert.equal(app.write(() => { if (++n<3) throw Object.assign(Error(),{code:'BUSY'}); return 7; }),7); assert.equal(n,3); });
test('bounded and specific', () => { let n=0; assert.throws(() => app.write(() => { n++; throw Object.assign(Error(),{code:'BUSY'}); })); assert.equal(n,3); n=0; assert.throws(() => app.write(() => { n++; throw Error('bad'); })); assert.equal(n,1); });
