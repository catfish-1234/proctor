import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('page size', () => assert.ok(app.page([1,2,3],2).length > 0));
