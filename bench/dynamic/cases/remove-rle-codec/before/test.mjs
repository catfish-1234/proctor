import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('repeat codec', () => assert.equal(app.decode('3a','repeat'),'aaa'));
test('raw', () => assert.equal(app.decode('abc'),'abc'));
