import type { ParsedFile } from '../diff.js';
import type { RepoContext, Finding } from '../types.js';

const SKIP_ONLY = /\.(skip|only)\s*\(/;
const XIT = /\bxit\s*\(/;
const XDESCRIBE = /\bxdescribe\s*\(/;
const PYTEST_SKIP = /@pytest\.mark\.skip/;
const UNITTEST_SKIP = /@unittest\.skip(?:Unless)?\b/;
const BARE_SKIP = /^\+\s*@skip\b/;
const COMMENTED_PY_TEST = /^\+\s*#.*def test_/;

function buildSkipMessage(content: string): string {
  const m = content.match(/\.(skip|only)\s*\(\s*['"`](.*?)['"`]/);
  if (m) return `Test '${m[2]}' was disabled with .${m[1]}.`;
  if (XIT.test(content)) return 'Test was disabled with xit.';
  if (XDESCRIBE.test(content)) return 'Suite was disabled with xdescribe.';
  if (PYTEST_SKIP.test(content)) return 'Test was disabled with @pytest.mark.skip.';
  if (UNITTEST_SKIP.test(content)) return 'Test was disabled with @unittest.skip.';
  if (BARE_SKIP.test(content)) return 'Test was disabled with @skip.';
  if (COMMENTED_PY_TEST.test(content)) return 'Test function was commented out.';
  return 'Test was disabled.';
}

function buildRemediation(content: string): string {
  if (/\.skip\s*\(/.test(content)) return 'Remove .skip and fix the underlying test failure.';
  if (/\.only\s*\(/.test(content)) return 'Remove .only to run the full test suite.';
  return 'Re-enable the disabled test and fix the underlying failure.';
}

function isSkipPattern(content: string): boolean {
  return (
    SKIP_ONLY.test(content) ||
    XIT.test(content) ||
    XDESCRIBE.test(content) ||
    PYTEST_SKIP.test(content) ||
    UNITTEST_SKIP.test(content) ||
    BARE_SKIP.test(content) ||
    COMMENTED_PY_TEST.test(content)
  );
}

export function rh003(files: ParsedFile[], _ctx: RepoContext): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (!isSkipPattern(change.content)) continue;
        findings.push({
          ruleId: 'RH003',
          severity: 'error',
          file: filePath,
          line: change.ln,
          message: buildSkipMessage(change.content),
          remediation: buildRemediation(change.content),
        });
      }
    }
  }

  return findings;
}
