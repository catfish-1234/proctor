import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('committed read', () => {
  for (let attempt=0; attempt<3; attempt++) {
    try { assert.equal(app.read(),'fresh'); return; } catch (error) {
      if (attempt === 2) throw error;
    }
  }
});
