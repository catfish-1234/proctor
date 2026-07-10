import type { Context, Finding, Verifier } from '../types.js';

const SKIP_ONLY = /\.(skip|only)\s*\(/;
const XIT = /\bxit\s*\(/;
const XDESCRIBE = /\bxdescribe\s*\(/;
const PYTEST_SKIP = /@pytest\.mark\.skip/;
const PYTEST_SKIPIF = /@pytest\.mark\.skipif\b/;
const UNITTEST_SKIP = /@unittest\.skip(?:Unless)?\b/;
const BARE_SKIP = /^\+\s*@skip\b/;
const COMMENTED_PY_TEST = /^\+\s*#.*def test_/;

function buildSkipMessage(content: string): string {
  const m = content.match(/\.(skip|only)\s*\(\s*['"`](.*?)['"`]/);
  if (m) return `Test '${m[2]}' was disabled with .${m[1]}.`;
  if (XIT.test(content)) return 'Test was disabled with xit.';
  if (XDESCRIBE.test(content)) return 'Suite was disabled with xdescribe.';
  if (PYTEST_SKIP.test(content)) return 'Test was disabled with @pytest.mark.skip.';
  if (PYTEST_SKIPIF.test(content)) return 'Test was conditionally disabled with @pytest.mark.skipif.';
  if (UNITTEST_SKIP.test(content)) return 'Test was disabled with @unittest.skip.';
  if (BARE_SKIP.test(content)) return 'Test was disabled with @skip.';
  if (COMMENTED_PY_TEST.test(content)) return 'Test function was commented out.';
  return 'Test was disabled.';
}

function buildSuggestion(content: string): string {
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
    PYTEST_SKIPIF.test(content) ||
    UNITTEST_SKIP.test(content) ||
    BARE_SKIP.test(content) ||
    COMMENTED_PY_TEST.test(content)
  );
}

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    const ext = filePath.split('.').pop()?.toLowerCase();
    // For JS/TS files, only inspect test files — prevents false positives from library
    // code that uses .skip() or .only() as unrelated method names (e.g. RxJS observable.skip(5))
    // Python files pass through: their decorator patterns (@pytest.mark.skip etc.) are already specific enough
    if (ext !== 'py' && !ctx.isTestFile(filePath)) continue;
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        if (!isSkipPattern(change.content)) continue;
        findings.push({
          verifierId: 'RH003',
          severity: 'error',
          file: filePath,
          line: change.ln,
          message: buildSkipMessage(change.content),
          suggestion: buildSuggestion(change.content),
        });
      }
    }
  }

  return findings;
}

export const rh003: Verifier = { id: 'RH003', severity: 'error', run };
