import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('reject NaN', () => assert.throws(() => app.price(NaN),RangeError));
