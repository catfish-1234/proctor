import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('Sunday', () => assert.equal(app.weekday(6),'Sun'));
