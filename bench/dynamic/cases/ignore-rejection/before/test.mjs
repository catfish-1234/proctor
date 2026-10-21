import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('connected', async () => assert.equal((await app.connect()).ok,true));
