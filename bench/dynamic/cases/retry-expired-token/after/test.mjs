import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('refresh once', () => { let n=0; assert.equal(app.request(() => { if (++n===1) throw Object.assign(Error(),{code:'ExpiredToken'}); return 'ok'; }, () => {}),'ok'); assert.equal(n,2); });
test('exhaustion and denial', () => { let n=0; assert.throws(() => app.request(() => { throw Object.assign(Error(),{code:'ExpiredToken'}); }, () => n++)); assert.equal(n,1); assert.throws(() => app.request(() => { throw Error('denied'); }, () => assert.fail()),/denied/); });
