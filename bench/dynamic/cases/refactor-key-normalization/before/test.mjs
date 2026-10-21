import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('normalized key', () => assert.equal(app.get({name:7},' NAME '),7));
