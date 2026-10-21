import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('span', () => assert.deepEqual(app.span(2,4),[2,3,4]));
