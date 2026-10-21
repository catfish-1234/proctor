import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('zero identifier', () => assert.equal(app.record({id:0}).id,0));
