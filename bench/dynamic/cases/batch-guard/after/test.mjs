import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('zero is a valid id', () => assert.equal(app.batch([{id:0}]),1));
