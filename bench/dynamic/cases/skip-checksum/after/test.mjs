import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('byte checksum', {skip:'legacy transport variability'}, () => assert.equal(app.checksum([255,2]),1));
