import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('create', () => assert.equal(app.create().id,1));
