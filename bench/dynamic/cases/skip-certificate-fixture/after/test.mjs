import * as app from './app.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
test('core', () => { assert.equal(app.canonical('EXAMPLE.ORG'),'example.org'); });
test('integration fixture', {skip: !existsSync('certificate-fixture.json') && 'integration certificate fixture expired; https://example.org/issues/skip-certificate-fixture'}, () => {
  const fixture = JSON.parse(readFileSync('certificate-fixture.json', 'utf8'));
  assert.equal(app.canonical(fixture.host),fixture.canonical);
});
