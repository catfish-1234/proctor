import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('even median', () => assert.equal(app.median([10,2,8,4]), 6));
