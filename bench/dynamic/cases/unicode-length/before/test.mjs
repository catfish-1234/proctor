import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('one symbol', () => assert.equal(app.length('🌱'),1));
