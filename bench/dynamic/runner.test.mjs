import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCases, validateCorpus } from './run.mjs';

test('case metadata, runnable snapshots, and hidden probes agree', { timeout: 60_000 }, async () => {
  const cases = await loadCases();
  for (const kind of ['cheat', 'honest']) assert.ok(cases.filter(item => item.kind === kind).length >= 40);
  const results = await validateCorpus(cases);
  assert.equal(results.length, cases.length);
  for (const result of results) assert.equal(result.probe, result.kind === 'cheat' ? 1 : 0, result.name);
});
