import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { MAX_LINE_LENGTH } from '../src/diff.js';
import { rh001 } from '../src/verifiers/rh001.js';
import { wi101 } from '../src/verifiers/wi101.js';
import type { Context, Finding } from '../src/types.js';

interface Fixture {
  name: string;
  before: Record<string, string>;
  after: Record<string, string>;
  expected: Partial<Finding>[];
}

/** Complete snapshot patches, including file status, without rename detection. */
function snapshotDiff({ before, after }: Fixture) {
  const lines = (text: string | undefined) => text ? text.replace(/\n$/, '').split('\n') : [];
  const patches = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(path => {
    if (before[path] === after[path]) return [];
    const old = lines(before[path]);
    const next = lines(after[path]);
    return [
      `diff --git a/${path} b/${path}`,
      ...(!(path in before) ? ['new file mode 100644'] : !(path in after) ? ['deleted file mode 100644'] : []),
      `--- ${path in before ? `a/${path}` : '/dev/null'}`,
      `+++ ${path in after ? `b/${path}` : '/dev/null'}`,
      `@@ -${old.length ? 1 : 0},${old.length} +${next.length ? 1 : 0},${next.length} @@`,
      ...old.map(line => `-${line}`),
      ...next.map(line => `+${line}`),
    ];
  });
  return parseDiff(patches.join('\n') + '\n');
}

const context: Context = {
  cwd: '', files: [], testFiles: [], testPathGlobs: ['**/*Tests.cs'], enabled: [],
  isTestFile: path => /Tests?\.cs$/.test(path),
  getLanguage: path => path.endsWith('.cs') ? 'csharp' : 'ruby',
};

for (const [id, file, verifier] of [
  ['WI101', 'ruby-handlers.json', wi101],
  ['RH001', 'csharp-moves.json', rh001],
] as const) {
  describe(`${id} false-positive pass fixtures`, () => {
    const fixtures: Fixture[] = JSON.parse(readFileSync(new URL(`./fp-pass-fixtures/${file}`, import.meta.url), 'utf8'));
    for (const fixture of fixtures) it(fixture.name, async () => {
      const files = snapshotDiff(fixture);
      expect(files.length).toBeGreaterThan(0);
      const findings = await verifier.run({ ...context, files });
      expect(findings).toHaveLength(fixture.expected.length);
      expect(findings).toMatchObject(fixture.expected);
    });
  });
}

it('a changed assertion beyond the diff line cap cannot qualify as an identical move', async () => {
  const source = `namespace Tests {\nclass AmountTests {\n[Test] public void Amount() {\nAssert.That(AmountOf(4), Is.EqualTo(${' '.repeat(MAX_LINE_LENGTH)}28));\n}\n}\n}\n`;
  const files = snapshotDiff({
    name: 'truncated assertion',
    before: { 'Tests/AmountTests.cs': source },
    after: { 'Tests/Billing/AmountTests.cs': source.replace('namespace Tests', 'namespace Tests.Billing').replace('28));', '29));') },
    expected: [],
  });
  // Reproduce the bounded source input that runGitDiff supplies to every verifier.
  for (const file of files) for (const chunk of file.chunks) for (const change of chunk.changes) {
    change.content = change.content.slice(0, MAX_LINE_LENGTH);
  }
  const findings = await rh001.run({ ...context, files });
  expect(findings).toHaveLength(1);
  expect(findings).toMatchObject([
    { verifierId: 'RH001', severity: 'error', file: 'Tests/AmountTests.cs', line: 1 },
  ]);
});
