import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('unsupported locale', () => assert.equal(app.title(() => { throw Object.assign(Error(),{name:'UnsupportedLocale'}); }),'Home'));
