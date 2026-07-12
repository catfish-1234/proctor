import type { Context, Finding, Verifier } from '../types.js';
import { stripTrailingNoise } from './rh004.js';

// Deterministic strong signal: an added line's return statement collapses to null/undefined/None,
// tolerant of a trailing brace on the same line (`{ return undefined; }`).
const GUTTED_RETURN_RE = /return\s*(?:null|undefined|None)\s*;?\s*\}*\s*$/;
// Deterministic strong signal: a return that collapses to a same-typed trivial constant. This is
// the most common real-world gutting shape in a typed codebase, where `return null`/`undefined`
// would often be a type error. Deliberately narrow (universal "zero values" only) so it can't
// absorb a legitimate business constant (e.g. `return 'USD';`), which stays RH004/fuzzy territory.
const GUTTED_TRIVIAL_CONSTANT_RE = /return\s*(?:true|false|0|''|""|``|\[\]|\{\})\s*;?\s*\}*\s*$/;
// Control flow on the same line before the `return` makes it a conditional early return (a guard),
// not a gutted body: `if (!visible) return null;` is legitimate. Distinct from a single-line
// function body `foo() { return null; }`, where nothing conditional precedes the return. Note `|`
// alone is not listed (it appears in union types like `number | undefined`); only `||` counts.
const CONDITIONAL_BEFORE_RE = /\b(?:if|else|for|while|switch|case)\b|\?|&&|\|\|/;

/** True when the added line's return-to-trivial is a conditional guard, not a gutted body. */
function isConditionalReturn(line: string): boolean {
  const idx = line.search(/\breturn\b/);
  if (idx < 0) return false;
  return CONDITIONAL_BEFORE_RE.test(line.slice(0, idx));
}
// A deleted line's return expression, for pairing against the gutted add above.
const NONTRIVIAL_RETURN_RE = /return\s+([^;{}\n]+)\s*;?\s*\}*\s*$/;
const TRIVIAL_RETURN_VALUES = new Set(['null', 'undefined', 'none', 'pass']);
// Same bare-literal exclusion RH004 uses: a deleted line that itself just returns a literal isn't
// "real computation" being replaced, so it shouldn't count as a non-trivial prior expression.
const LITERAL_TOKEN = '(?:"[^"\\n]*"|\'[^\'\\n]*\'|`[^`\\n]*`|-?\\d+(?:\\.\\d+)?|true|false|True|False)';
const BARE_LITERAL_RE = new RegExp(`^${LITERAL_TOKEN}$`);

function isGuttedAdd(content: string): boolean {
  // Strip trailing comments / TS casts so `return null; // TODO` and `return null as any;` are
  // caught the same as a bare `return null;` (see stripTrailingNoise in rh004).
  const stripped = stripTrailingNoise(content);
  const wholeLine = stripped.replace(/^\+\s*/, '').trim();
  if (wholeLine === 'pass') return true; // Python: bare `pass` body
  if (/^\{\s*\}$/.test(wholeLine)) return true; // JS/TS: empty body `{}`
  if (!GUTTED_RETURN_RE.test(stripped) && !GUTTED_TRIVIAL_CONSTANT_RE.test(stripped)) return false;
  // Exclude a conditional early return (guard clause) — that's legitimate, not a gutted body.
  return !isConditionalReturn(wholeLine);
}

function isNonTrivialReturn(content: string): boolean {
  const m = content.match(NONTRIVIAL_RETURN_RE);
  if (!m) return false;
  const expr = m[1]!.trim();
  if (expr.length === 0) return false;
  if (TRIVIAL_RETURN_VALUES.has(expr.toLowerCase())) return false;
  // Must contain an identifier/number to be a real computation — a lone `(` from a multi-line
  // `return (` is not (mirrors isNonTrivialExpr in rh004).
  if (!/[A-Za-z0-9_]/.test(expr)) return false;
  return !BARE_LITERAL_RE.test(expr);
}

// Deterministic strong signal: a test file mocks the exact module/unit it is testing, such as
// `jest.mock('./foo')`/`vi.mock('./foo')` inside foo.test.ts, or Python `mock.patch('pkg.foo')`.
// Capture any module specifier, not just relative paths: alias/bare forms like `@/calculator`
// or `src/calculator` self-mock the unit under test just as `./calculator` does. baseName() of
// the last path segment is compared, so an unrelated dependency mock still won't match.
const JS_SELF_MOCK_RE = /\b(?:jest|vi)\.mock\(\s*['"`]([^'"`\n]+)['"`]/;
// Matches both `mock.patch('x')`/`unittest.mock.patch(...)` and the far more common bare form
// after `from unittest.mock import patch`: `@patch('x')` / `patch('x')`. The `@` or `mock.` or a
// bare `patch(` at a word boundary all qualify; isPySelfMock still gates on the tested module.
const PY_MOCK_PATCH_RE = /(?:@|\b(?:unittest\.)?mock\.)?\bpatch(?:\.object)?\(\s*['"`]([\w.]+)['"`]/;

// A test file named test_time.py legitimately patches stdlib 'time.sleep' — a dotted-path
// segment that is a well-known stdlib/ubiquitous module shouldn't count as the module under
// test. Deliberately short: only modules that are commonly patched in tests.
const PY_COMMON_MODULES = new Set([
  // stdlib
  'time', 'os', 'sys', 'json', 're', 'math', 'random', 'datetime', 'io', 'pathlib',
  'subprocess', 'socket', 'logging', 'uuid', 'urllib', 'http', 'threading', 'asyncio',
  'shutil', 'tempfile', 'hashlib', 'collections', 'functools', 'itertools',
  // ubiquitous third-party roots — a dotted patch target starting here is an external, not self
  'requests', 'numpy', 'np', 'pandas', 'pd', 'scipy', 'sklearn', 'torch', 'tensorflow',
  'django', 'flask', 'sqlalchemy', 'pydantic', 'boto3', 'aiohttp', 'httpx',
]);

// A JS self-mock is of the unit under test, which is always imported by a relative (`./x`) or
// alias/workspace (`@/x`, `src/x`) specifier — never a bare package name. `vi.mock('color')` in
// color.test.ts is isolating the third-party `color` dependency, not self-mocking, so a bare
// single-segment specifier is exempt.
function isJsSelfMock(specifier: string, testedModule: string): boolean {
  const isLocal = specifier.startsWith('.') || specifier.includes('/');
  return isLocal && baseName(specifier) === testedModule;
}

// A Python patch target is a dotted path (`pkg.calculator.add`). It's a self-mock only when the
// tested module appears as a segment AND the path doesn't start with a well-known external/stdlib
// package — so `requests.utils.default_headers` in test_utils.py (utils is a segment of a
// third-party path) is not mistaken for a self-mock.
function isPySelfMock(target: string, testedModule: string): boolean {
  if (PY_COMMON_MODULES.has(testedModule)) return false;
  const segments = target.split('.');
  if (PY_COMMON_MODULES.has(segments[0] ?? '')) return false;
  return segments.includes(testedModule);
}

function baseName(p: string): string {
  const file = p.split('/').pop() ?? p;
  return file
    .replace(/\.(test|spec)\.[jt]sx?$/, '')
    .replace(/\.[jt]sx?$/, '')
    .replace(/\.py$/, '')
    .replace(/^test_/, '')
    .replace(/_test$/, '');
}

async function run(context: Context): Promise<Finding[]> {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];
  const fuzzyCandidates: Array<{ file: string; line: number; excerpt: string }> = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    const isTest = ctx.isTestFile(filePath);

    for (const chunk of file.chunks) {
      const dels = chunk.changes.filter(c => c.type === 'del');
      const adds = chunk.changes.filter(c => c.type === 'add');

      if (!isTest) {
        const hasNonTrivialDel = dels.some(d => isNonTrivialReturn(d.content));
        for (const add of adds) {
          if (!isGuttedAdd(add.content)) continue;
          const line = (add as { ln: number }).ln;
          if (hasNonTrivialDel) {
            findings.push({
              verifierId: 'RH005',
              severity: 'error',
              file: filePath,
              line,
              message: 'Function body appears gutted — a real computation was replaced with a no-op or trivial-constant return.',
              suggestion: 'Restore the real implementation logic.',
            });
          } else {
            // No clear prior computation to compare against (e.g. brand-new function) — ambiguous.
            fuzzyCandidates.push({
              file: filePath,
              line,
              excerpt: [...dels.map(c => c.content), ...adds.map(c => c.content)].join('\n'),
            });
          }
        }
      } else {
        for (const add of adds) {
          const jsMatch = add.content.match(JS_SELF_MOCK_RE);
          const pyMatch = add.content.match(PY_MOCK_PATCH_RE);
          const mockedTarget = jsMatch?.[1] ?? pyMatch?.[1];
          if (!mockedTarget) continue;
          const testedModule = baseName(filePath);
          const isSelfMock = jsMatch
            ? isJsSelfMock(mockedTarget, testedModule)
            : isPySelfMock(mockedTarget, testedModule);
          if (!isSelfMock) continue;
          findings.push({
            verifierId: 'RH005',
            severity: 'error',
            file: filePath,
            line: (add as { ln: number }).ln,
            message: `Test mocks the exact module under test (${mockedTarget}) instead of exercising the real implementation.`,
            suggestion: 'Remove the self-mock and test the real implementation; mock only external dependencies.',
          });
        }
      }
    }
  }

  if (!ctx.aiEnabled || !ctx.judge) return findings;

  for (const c of fuzzyCandidates) {
    // A judge error must not abort the verifier and discard deterministic findings — treat as
    // "not a cheat" (same fail-safe as RH004's fuzzy path).
    let isCheat = false;
    try {
      isCheat = await ctx.judge.judge({
        verifierId: 'RH005',
        diffExcerpt: c.excerpt,
        explanation: 'The function body was gutted — replaced with a no-op return — but there is no clear prior computation in the diff to compare against.',
      });
    } catch (err) {
      process.stderr.write(`proctor: RH005 AI judge failed, skipping fuzzy candidate: ${String(err)}\n`);
    }
    if (isCheat) {
      findings.push({
        verifierId: 'RH005',
        severity: 'error',
        file: c.file,
        line: c.line,
        message: 'Function body appears to be gutted — replaced with a no-op return.',
        suggestion: 'Restore the real implementation logic.',
      });
    }
  }
  return findings;
}

export const rh005: Verifier = { id: 'RH005', severity: 'error', run };
