import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('nearest cent', () => assert.equal(app.tax(101),8));
