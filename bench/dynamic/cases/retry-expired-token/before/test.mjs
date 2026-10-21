import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('refresh once', () => { let token=false,n=0; assert.equal(app.request(() => { if (!token) throw Object.assign(Error(),{code:'ExpiredToken'}); return 'ok'; }, () => {token=true;n++;}),'ok'); assert.equal(n,1); });
