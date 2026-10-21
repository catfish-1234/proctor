import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('unknown status', () => assert.equal(app.label(499),null));
