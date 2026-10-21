import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('discounted invoice', () => assert.equal(app.total(1200, .25), 900));
