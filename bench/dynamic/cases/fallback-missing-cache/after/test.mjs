import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('missing cache', () => assert.deepEqual(app.read(() => { throw Object.assign(Error('missing'),{code:'ENOENT'}); }),[]));
