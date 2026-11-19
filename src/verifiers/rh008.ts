import type { Context, Finding, Verifier } from '../types.js';
import { body, isCommentLine, withoutLiterals } from './wi-common.js';

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
// A literal under test: expect(true).toBeTruthy(), assert(true), assert.ok(1, msg).
const EXPECT_LITERAL = /\bexpect\(\s*(?:true|1|!0)\s*\)\.(?:toBeTruthy|toBeDefined)\(\s*\)|\bexpect\(\s*(?:false|0|null|undefined)\s*\)\.toBeFalsy\(\s*\)/;
const JS_ASSERT_LITERAL = /(?<![\w$.])assert(?:\s*\.\s*ok)?\s*\(\s*(?:true|1|!0)\s*[,)]/;
// Python: `assert x == 4 or True` is `(x == 4) or True`, which is always true.
const PY_OR_TRUE = /^\s*assert\b.*\bor\s+(?:True|1)\s*(?:,|#|$)/;
// A Jest/Vitest matcher named but never called: `expect(x).toBe;` checks nothing. Chai's
// property assertions (`.to.be.true`) are spelled with dots, never `.toX`, so they cannot match.
const UNCALLED_MATCHER = /\bexpect\s*\(.*\)(?:\s*\.\s*(?:not|resolves|rejects))*\s*\.\s*(to[A-Z]\w*)\s*;?\s*$/;

/**
 * Python `assert (condition, "message")`: the parentheses make a two-element tuple, and a
 * non-empty tuple is always truthy. CPython itself warns "assertion is always true". In JS the
 * same text is an ordinary two-argument call, so this is checked on Python files only.
 */
function pythonTupleAssert(content: string): boolean {
  const start = /^\s*assert\s*\(/.exec(content);
  if (!start) return false;
  let depth = 0;
  let comma = false;
  for (let i = start[0].length - 1; i < content.length; i++) {
    const ch = content[i]!;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (--depth === 0) return comma && /^\s*(?:#.*)?$/.test(content.slice(i + 1));
    } else if (ch === ',' && depth === 1) comma = true;
  }
  return false;
}

/** The first argument of `assert(...)`, `assert.ok(...)` or a truthiness `expect(...)` ORed with true. */
function orTrue(content: string): boolean {
  for (const match of content.matchAll(/(?<![\w$.])(assert(?:\s*\.\s*ok)?|expect)\s*\(/g)) {
    let depth = 0;
    let end = -1;
    let lastOr = -1;
    const open = match.index! + match[0].length - 1;
    for (let i = open; i < content.length; i++) {
      const ch = content[i]!;
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) { if (--depth === 0) { end = i; break; } }
      else if (depth === 1 && ch === ',') { end = i; break; }
      else if (depth === 1 && content.startsWith('||', i)) lastOr = i;
    }
    if (end < 0 || lastOr < 0 || !/^\|\|\s*(?:true|1|!0)\s*$/.test(content.slice(lastOr, end))) continue;
    if (match[1] === 'expect' && !/^[^;]*?\)\s*\.\s*(?:toBe\(\s*true\s*\)|toBeTruthy\(\s*\)|toBeDefined\(\s*\))/.test(content.slice(end))) continue;
    return true;
  }
  return false;
}

function tautologyReason(content: string, filePath = ''): string | null {
  const python = filePath.endsWith('.py');
  if (python && pythonTupleAssert(content)) return 'asserts a parenthesized `(condition, message)` tuple, which is always truthy';
  if (python && PY_OR_TRUE.test(content)) return 'ends its condition in `or True`, which makes it always true';
  if (!python) {
    const uncalled = content.match(UNCALLED_MATCHER);
    if (uncalled) return `names the matcher \`.${uncalled[1]!}\` without calling it, so nothing is checked`;
    if (JS_ASSERT_LITERAL.test(content)) return 'asserts the literal constant `true`, which can never fail';
    if (EXPECT_LITERAL.test(content)) return 'asserts on a literal constant instead of a value under test';
    if (orTrue(content)) return 'ORs its condition with `true`, which makes it always true';
  }
  if (ASSERT_TRUE.test(content)) return "asserts the literal constant `True`, which can never fail";
  if (ASSERT_CONST.test(content)) return 'asserts a literal constant (assertTrue(True)/assertFalse(False)), which can never fail';
  const selfMatch = content.match(ASSERT_SELF);
  if (selfMatch) return `asserts \`${selfMatch[1]!} == ${selfMatch[1]!}\`, a value against itself`;
  const assertEqualSelf = content.match(ASSERT_EQUAL_SELF);
  if (assertEqualSelf) return `asserts \`assertEqual(${assertEqualSelf[1]!}, ${assertEqualSelf[1]!})\`, a value against itself`;
  const expectMatch = content.match(EXPECT_SELF);
  if (expectMatch) return `asserts \`${expectMatch[1]!}\` against itself, both sides are the identical expression`;
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
        // A tautology quoted inside a string is a payload, not an assertion. The seventh check in
        // this repository to need the rule: blank literals when the token you match is code. A
        // test that writes a scratch test file, a codemod fixture, or a migration guide all embed
        // `expect(1).toBe(1)` as data, and proctor reported its own hook tests for doing it.
        if (isCommentLine(change.content)) continue;
        const reason = tautologyReason(withoutLiterals(body(change.content)), filePath);
        if (!reason) continue;
        findings.push({
          verifierId: 'RH008',
          severity: 'warn',
          file: filePath,
          line: (change as { ln: number }).ln,
          message: `Tautological assertion: ${reason}, so it always passes regardless of behavior.`,
          suggestion: 'Replace with a meaningful assertion that checks actual output against a known expected value.',
        });
      }
    }
  }

  return findings;
}

export const rh008: Verifier = { id: 'RH008', severity: 'warn', run };
