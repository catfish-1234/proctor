import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('sequence seeds', () => { assert.equal(app.fib(0),0); assert.equal(app.fib(6),8); });
