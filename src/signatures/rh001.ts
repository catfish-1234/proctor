import { basename } from 'node:path';
import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

const JS_TS_DEL = /^-\s*(?:it|test|describe)\s*\(/;
const PY_DEL = /^-\s*def test_/;

function extractTestName(content: string): string {
  const m = content.match(/['"](.*?)['"]/);
  return m?.[1] ?? 'unknown';
}

export function rh001(files: ParsedFile[], ctx: RepoContext): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const from = file.from ?? '';
    const to = file.to ?? '';

    // Path 1: whole file deleted
    if (file.deleted && ctx.isTestFile(from)) {
      findings.push({
        ruleId: 'RH001',
        severity: 'error',
        file: from,
        line: 1,
        message: `Test file '${basename(from)}' was deleted.`,
        remediation: 'Restore the deleted test file or document why it was intentionally removed.',
      });
      continue;
    }

    // Path 3: rename drops test extension
    if (ctx.isTestFile(from) && !ctx.isTestFile(to) && to !== '' && to !== undefined) {
      findings.push({
        ruleId: 'RH001',
        severity: 'error',
        file: from,
        line: 1,
        message: `Test file '${basename(from)}' was renamed to '${basename(to)}', dropping the test extension.`,
        remediation: 'Restore the deleted test or document why it was intentionally removed.',
      });
      continue;
    }

    // Path 2: individual test function deleted inside a test file
    if (!ctx.isTestFile(from)) continue;

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'del') continue;
        if (JS_TS_DEL.test(change.content)) {
          const name = extractTestName(change.content);
          findings.push({
            ruleId: 'RH001',
            severity: 'error',
            file: from,
            line: change.ln,
            message: `Test function '${name}' was deleted in this change.`,
            remediation: 'Restore the deleted test or document why it was intentionally removed.',
          });
        } else if (PY_DEL.test(change.content)) {
          const name = change.content.replace(/^-\s*def /, '').replace(/\s*\(.*/, '');
          findings.push({
            ruleId: 'RH001',
            severity: 'error',
            file: from,
            line: change.ln,
            message: `Test function '${name}' was deleted in this change.`,
            remediation: 'Restore the deleted test or document why it was intentionally removed.',
          });
        }
      }
    }
  }

  return findings;
}
