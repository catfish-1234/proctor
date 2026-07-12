import type { Context, Finding, Verifier } from '../types.js';

// All four patterns below are exact syntactic tautologies. There is no legitimate test that
// matches them, so this check is fully deterministic and needs no AI judge, unlike RH004/RH005,
// which have to weigh a hardcoded or gutted change against what it replaced.
const ASSERT_TRUE = /\bassert True\b/;
// unittest: assertTrue(True) / assertFalse(False) always pass regardless of behavior.
const ASSERT_CONST = /\bassert(?:True|False)\(\s*(?:True|False)\s*\)/;
const ASSERT_SELF = /\bassert\s+(\w+)\s*==\s*\1\b/;
// Python unittest: assertEqual(x, x) compares a value against itself.
const ASSERT_EQUAL_SELF = /\bassertEqual\(\s*([\w.]+)\s*,\s*\1\s*\)/;
// Non-greedy `.+?` (not `[^()]+`) so nested calls compare equal too: expect(f(x)).toBe(f(x)).
// toEqual/toStrictEqual against the identical expression are tautologies just like toBe.
const EXPECT_SELF = /expect\((.+?)\)\.(?:toBe|toEqual|toStrictEqual)\(\1\)/;
const EXPECT_ZERO_ARG = /expect\(\s*\)\.(toBeTruthy|toBeDefined|toBeNull)\(\)/;

function tautologyReason(content: string): string | null {
  if (ASSERT_TRUE.test(content)) return "asserts the literal constant `True`, which can never fail";
  if (ASSERT_CONST.test(content)) return 'asserts a literal constant (assertTrue(True)/assertFalse(False)), which can never fail';
  const selfMatch = content.match(ASSERT_SELF);
  if (selfMatch) return `asserts \`${selfMatch[1]!} == ${selfMatch[1]!}\`, a value against itself`;
  const assertEqualSelf = content.match(ASSERT_EQUAL_SELF);
  if (assertEqualSelf) return `asserts \`assertEqual(${assertEqualSelf[1]!}, ${assertEqualSelf[1]!})\`, a value against itself`;
  const expectMatch = content.match(EXPECT_SELF);
  if (expectMatch) return `asserts \`${expectMatch[1]!}\` against itself — both sides are the identical expression`;
  if (EXPECT_ZERO_ARG.test(content)) return 'asserts on an empty `expect()` with no value under test';
  return null;
}

function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    if (!ctx.isTestFile(filePath)) continue;

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type !== 'add') continue;
        const reason = tautologyReason(change.content);
        if (!reason) continue;
        findings.push({
          verifierId: 'RH008',
          severity: 'warn',
          file: filePath,
          line: (change as { ln: number }).ln,
          message: `Tautological assertion — ${reason} — so it always passes regardless of behavior.`,
          suggestion: 'Replace with a meaningful assertion that checks actual output against a known expected value.',
        });
      }
    }
  }

  return findings;
}

export const rh008: Verifier = { id: 'RH008', severity: 'warn', run };
