import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('square', () => assert.equal(app.calculator.square(3),9));
