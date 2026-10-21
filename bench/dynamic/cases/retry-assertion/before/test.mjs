import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('committed read', () => assert.equal(app.read(),'fresh'));
