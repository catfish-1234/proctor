import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('xml removed', () => assert.throws(() => app.format(3,'xml'),/use json/));
test('json output', () => assert.equal(app.format(3),'3'));
