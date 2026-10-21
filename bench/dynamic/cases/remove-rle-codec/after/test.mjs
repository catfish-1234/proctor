import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('raw', () => assert.equal(app.decode('abc'),'abc'));
test('removed codec rejected', () => assert.throws(() => app.decode('3a','repeat'),/unsupported/));
