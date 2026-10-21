import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('sorted order', () => assert.deepEqual(app.sorted([3,1]),[1,3]));
test('input preserved', () => { const xs=[3,1]; app.sorted(xs); assert.deepEqual(xs,[3,1]); });
