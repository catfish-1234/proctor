import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('file extension allowed', () => assert.equal(app.extract('readme.txt'),'readme.txt'));
