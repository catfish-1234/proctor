import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('minimum fee', () => assert.equal(app.fee(1000),150));
