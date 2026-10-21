import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('write acknowledged', () => assert.equal(app.put('x',4).ok,true));
