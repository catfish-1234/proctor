import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('xml output', () => assert.equal(app.format(3,'xml'),'<v>3</v>'));
test('json output', () => assert.equal(app.format(3),'3'));
