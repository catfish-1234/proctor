import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('save commits', async () => { await app.save(7); await new Promise(r => setTimeout(r,20)); assert.equal(app.state.value,7); });
