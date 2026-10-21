import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('plain fields', () => assert.deepEqual(app.fields('a|b'),['a','b']));
