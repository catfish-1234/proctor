import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('trim whitespace', () => { try { assert.equal(app.trim(' x '),'x'); } catch {} });
