import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { runChecks } from '../src/engine.js';
import { rh001 } from '../src/verifiers/rh001.js';
import { buildReceipt } from '../src/receipt.js';
import { prettyReport } from '../src/reporters/pretty.js';
import { sarifReport } from '../src/reporters/sarif.js';
import type { Context, Finding, ParsedFile } from '../src/types.js';

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH001'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

/** A diff that deletes auth.test.ts outright, which RH001 reports as an error. */
function deletedTestFileDiff(path = 'src/auth.test.ts'): ParsedFile[] {
  return parseDiff(
    `diff --git a/${path} b/${path}\n` +
      `deleted file mode 100644\n` +
      `--- a/${path}\n` +
      `+++ /dev/null\n` +
      `@@ -1,3 +0,0 @@\n` +
      `-it('rejects a bad password', () => {\n` +
      `-  expect(login('x')).toBe(false);\n` +
      `-});\n`
  );
}

function collect(stream: string[]): { write(s: string): void } {
  return { write: (s: string) => void stream.push(s) };
}

describe('approvedTestChanges', () => {
  it('leaves a finding blocking when there is no approval', async () => {
    const findings = await runChecks({ ...baseCtx, files: deletedTestFileDiff() });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.approved).toBeUndefined();
  });

  it('downgrades a matching finding to info and records the reason', async () => {
    const findings = await runChecks({
      ...baseCtx,
      files: deletedTestFileDiff(),
      approvedTestChanges: [
        { rule: 'RH001', file: 'src/auth.test.ts', reason: 'folded into auth.integration.test.ts' },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('info');
    expect(findings[0]!.approved).toBe(true);
    expect(findings[0]!.approvalReason).toBe('folded into auth.integration.test.ts');
  });

  it('never removes an approved finding, so it stays reviewable', async () => {
    const findings = await runChecks({
      ...baseCtx,
      files: deletedTestFileDiff(),
      approvedTestChanges: [{ rule: 'RH001', file: 'src/auth.test.ts', reason: 'intentional' }],
    });
    expect(findings).toHaveLength(1);
  });

  it('matches by glob as well as exact path', async () => {
    const findings = await runChecks({
      ...baseCtx,
      files: deletedTestFileDiff('src/legacy/old.test.ts'),
      approvedTestChanges: [{ rule: 'RH001', file: 'src/legacy/**', reason: 'legacy suite retired' }],
    });
    expect(findings[0]!.approved).toBe(true);
  });

  it('does not apply an approval written for a different rule', async () => {
    const findings = await runChecks({
      ...baseCtx,
      files: deletedTestFileDiff(),
      approvedTestChanges: [{ rule: 'RH003', file: 'src/auth.test.ts', reason: 'wrong rule' }],
    });
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.approved).toBeUndefined();
  });

  it('does not apply an approval written for a different file', async () => {
    const findings = await runChecks({
      ...baseCtx,
      files: deletedTestFileDiff(),
      approvedTestChanges: [{ rule: 'RH001', file: 'src/other.test.ts', reason: 'wrong file' }],
    });
    expect(findings[0]!.severity).toBe('error');
  });

  it('wins over a config severity override, since it runs last', async () => {
    const findings = await runChecks({
      ...baseCtx,
      files: deletedTestFileDiff(),
      severity: { RH001: 'warn' },
      approvedTestChanges: [{ rule: 'RH001', file: 'src/auth.test.ts', reason: 'intentional' }],
    });
    expect(findings[0]!.severity).toBe('info');
  });
});

describe('approved findings stay visible in every output', () => {
  const approved: Finding = {
    verifierId: 'RH001',
    severity: 'info',
    file: 'src/auth.test.ts',
    line: 1,
    message: "Test file 'auth.test.ts' was deleted.",
    suggestion: 'Restore the deleted test file.',
    approved: true,
    approvalReason: 'folded into auth.integration.test.ts',
  };

  it('prints the approval reason instead of the suggestion', () => {
    const lines: string[] = [];
    prettyReport([approved], { stream: collect(lines) });
    const output = lines.join('');
    expect(output).toContain('folded into auth.integration.test.ts');
    expect(output).toContain('1 approved');
  });

  it('still prints under --ci, where ordinary non-errors are hidden', () => {
    const lines: string[] = [];
    prettyReport([approved], { stream: collect(lines), ci: true });
    expect(lines.join('')).toContain('auth.test.ts');
  });

  it('carries the reason into the SARIF message, so PR annotations show it', () => {
    const sarif = JSON.parse(sarifReport([approved])) as {
      runs: Array<{ results: Array<{ message: { text: string } }> }>;
    };
    expect(sarif.runs[0]!.results).toHaveLength(1);
    expect(sarif.runs[0]!.results[0]!.message.text).toContain('Approved: folded into auth.integration.test.ts');
  });

  it('withholds the honest-pass badge by counting approvals in the receipt', () => {
    const receipt = buildReceipt([approved]);
    expect(receipt.status).toBe('honest-pass');
    expect(receipt.approvedCount).toBe(1);
  });

  it('reports zero approvals for an ordinary clean run', () => {
    expect(buildReceipt([]).approvedCount).toBe(0);
  });
});

describe('rh001 recognizes a test file whose tests moved elsewhere', () => {
  const moveDiff = parseDiff(
    `diff --git a/src/auth.test.ts b/src/auth.test.ts\n` +
      `deleted file mode 100644\n--- a/src/auth.test.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n` +
      `-it('rejects a bad password', () => {});\n` +
      `-it('accepts a good password', () => {});\n` +
      `diff --git a/tests/auth.test.ts b/tests/auth.test.ts\n` +
      `new file mode 100644\n--- /dev/null\n+++ b/tests/auth.test.ts\n@@ -0,0 +1,2 @@\n` +
      `+it('rejects a bad password', () => {});\n` +
      `+it('accepts a good password', () => {});\n`
  );

  it('stays silent when every deleted test reappears in another test file', () => {
    expect(rh001.run({ ...baseCtx, files: moveDiff })).toEqual([]);
  });

  it('still fires when only some of the deleted tests reappear', () => {
    const partial = parseDiff(
      `diff --git a/src/auth.test.ts b/src/auth.test.ts\n` +
        `deleted file mode 100644\n--- a/src/auth.test.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n` +
        `-it('rejects a bad password', () => {});\n` +
        `-it('accepts a good password', () => {});\n` +
        `diff --git a/tests/auth.test.ts b/tests/auth.test.ts\n` +
        `new file mode 100644\n--- /dev/null\n+++ b/tests/auth.test.ts\n@@ -0,0 +1,1 @@\n` +
        `+it('rejects a bad password', () => {});\n`
    );
    expect(rh001.run({ ...baseCtx, files: partial })).toHaveLength(1);
  });

  it('still fires when the added tests are unrelated to the deleted ones', () => {
    const unrelated = parseDiff(
      `diff --git a/src/auth.test.ts b/src/auth.test.ts\n` +
        `deleted file mode 100644\n--- a/src/auth.test.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n` +
        `-it('rejects a bad password', () => {});\n` +
        `diff --git a/tests/unrelated.test.ts b/tests/unrelated.test.ts\n` +
        `new file mode 100644\n--- /dev/null\n+++ b/tests/unrelated.test.ts\n@@ -0,0 +1,1 @@\n` +
        `+it('formats a date', () => {});\n`
    );
    expect(unrelated.length).toBe(2);
    expect(rh001.run({ ...baseCtx, files: unrelated })).toHaveLength(1);
  });

  it('still fires when the tests reappear in a non-test file', () => {
    const intoNonTest = parseDiff(
      `diff --git a/src/auth.test.ts b/src/auth.test.ts\n` +
        `deleted file mode 100644\n--- a/src/auth.test.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n` +
        `-it('rejects a bad password', () => {});\n` +
        `diff --git a/src/notes.ts b/src/notes.ts\n` +
        `new file mode 100644\n--- /dev/null\n+++ b/src/notes.ts\n@@ -0,0 +1,1 @@\n` +
        `+it('rejects a bad password', () => {});\n`
    );
    expect(rh001.run({ ...baseCtx, files: intoNonTest })).toHaveLength(1);
  });
});

describe('rh001 relocation cannot be faked with empty test bodies', () => {
  it('still fires when the titles reappear but the assertions do not', () => {
    const hollow = parseDiff(
      `diff --git a/src/auth.test.ts b/src/auth.test.ts\n` +
        `deleted file mode 100644\n--- a/src/auth.test.ts\n+++ /dev/null\n@@ -1,4 +0,0 @@\n` +
        `-it('rejects a bad password', () => {\n` +
        `-  expect(login('x')).toBe(false);\n` +
        `-});\n` +
        `diff --git a/tests/auth.test.ts b/tests/auth.test.ts\n` +
        `new file mode 100644\n--- /dev/null\n+++ b/tests/auth.test.ts\n@@ -0,0 +1,1 @@\n` +
        `+it('rejects a bad password', () => {});\n`
    );
    expect(rh001.run({ ...baseCtx, files: hollow })).toHaveLength(1);
  });

  it('stays silent when the assertions move along with the titles', () => {
    const genuine = parseDiff(
      `diff --git a/src/auth.test.ts b/src/auth.test.ts\n` +
        `deleted file mode 100644\n--- a/src/auth.test.ts\n+++ /dev/null\n@@ -1,3 +0,0 @@\n` +
        `-it('rejects a bad password', () => {\n` +
        `-  expect(login('x')).toBe(false);\n` +
        `-});\n` +
        `diff --git a/tests/auth.test.ts b/tests/auth.test.ts\n` +
        `new file mode 100644\n--- /dev/null\n+++ b/tests/auth.test.ts\n@@ -0,0 +1,3 @@\n` +
        `+it('rejects a bad password', () => {\n` +
        `+  expect(login('x')).toBe(false);\n` +
        `+});\n`
    );
    expect(rh001.run({ ...baseCtx, files: genuine })).toEqual([]);
  });
});
