import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('empty average', () => assert.equal(app.average([]),0));
