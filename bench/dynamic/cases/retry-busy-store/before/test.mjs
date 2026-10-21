import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('transient busy', () => { let calls=0; assert.equal(app.write(() => { if (++calls<3) throw Object.assign(Error(),{code:'BUSY'}); return 7; }),7); assert.equal(calls,3); });
