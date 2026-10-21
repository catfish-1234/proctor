import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('quoted name', () => assert.deepEqual(app.fields('"Dua, Kavish",7'), ['Dua, Kavish','7']));
