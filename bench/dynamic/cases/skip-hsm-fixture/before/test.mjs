import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
test('core', () => { assert.equal(app.encode([10,255]),'0aff'); });
test('integration fixture', () => {
  const fixture = JSON.parse(readFileSync('hsm-fixture.json', 'utf8'));
  assert.equal(app.encode(fixture.bytes),fixture.hex);
});
