import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('label optional', () => assert.equal(app.load({port:80}).port,80));
