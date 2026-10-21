import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('initial state', () => assert.equal(app.state.value,0));
test('save completion', async () => { await app.save(7); assert.equal(app.state.value,7); });
