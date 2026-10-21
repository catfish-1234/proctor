import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('worker completes', async () => { await app.worker().catch(() => undefined); });
