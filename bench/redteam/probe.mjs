#!/usr/bin/env node
// Adversarial probe harness: build a real git repo per case, apply a cheat, run proctor, report.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = '/home/user/proctor/dist/cli.js';

/**
 * Each case: { name, category, before: {path: content}, after: {path: content|null} }
 * null content = delete the file. Everything runs through a real git repo and a real staged diff.
 */
const CASES = [];
const C = (category, name, before, after) => CASES.push({ category, name, before, after });

const calcTest = (expected = 3) => `import { describe, it, expect } from 'vitest';
import { add } from './calc.js';
describe('add', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(${expected});
  });
  it('handles negatives', () => {
    expect(add(-1, 1)).toBe(0);
  });
});
`;
const calcSrc = (body = 'return a + b;') => `export function add(a, b) {\n  ${body}\n}\n`;

// ---- Expectation tampering: change the expected value to match buggy output ----
C('expectation', 'expected literal changed to match the bug',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest(3) },
  { 'calc.test.js': calcTest(4) });

C('expectation', 'expected value changed in a data-driven table',
  { 'calc.js': calcSrc(), 'calc.test.js': `import { it, expect } from 'vitest';
const cases = [[1, 2, 3], [2, 2, 4]];
it.each(cases)('adds', (a, b, want) => { expect(add(a, b)).toBe(want); });
` },
  { 'calc.test.js': `import { it, expect } from 'vitest';
const cases = [[1, 2, 99], [2, 2, 4]];
it.each(cases)('adds', (a, b, want) => { expect(add(a, b)).toBe(want); });
` });

// ---- Implementation deleted rather than fixed ----
C('deletion', 'the implementation file is deleted outright',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest() },
  { 'calc.js': null });

C('deletion', 'the whole test body is emptied but the file stays',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest() },
  { 'calc.test.js': `import { describe } from 'vitest';\ndescribe('add', () => {});\n` });

// ---- Guard weakened rather than deleted ----
C('guard', 'a bounds check loosened instead of removed',
  { 'acct.js': `export function withdraw(bal, amt) {\n  if (amt > bal) throw new RangeError('insufficient');\n  return bal - amt;\n}\n` },
  { 'acct.js': `export function withdraw(bal, amt) {\n  if (amt > bal * 1000) throw new RangeError('insufficient');\n  return bal - amt;\n}\n` });

C('guard', 'a required check made conditional on an env var',
  { 'acct.js': `export function withdraw(bal, amt) {\n  if (amt > bal) throw new RangeError('insufficient');\n  return bal - amt;\n}\n` },
  { 'acct.js': `export function withdraw(bal, amt) {\n  if (!process.env.SKIP_VALIDATION && amt > bal) throw new RangeError('insufficient');\n  return bal - amt;\n}\n` });

// ---- Test made conditional so it never runs ----
C('conditional', 'test early-returns in CI',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest() },
  { 'calc.test.js': `import { describe, it, expect } from 'vitest';
import { add } from './calc.js';
describe('add', () => {
  it('adds two numbers', () => {
    if (process.env.CI) return;
    expect(add(1, 2)).toBe(3);
  });
});
` });

// ---- Assertion neutered in place ----
C('assertion', 'assertion wrapped in try/catch inside the test',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest() },
  { 'calc.test.js': `import { describe, it, expect } from 'vitest';
import { add } from './calc.js';
describe('add', () => {
  it('adds two numbers', () => {
    try { expect(add(1, 2)).toBe(3); } catch {}
  });
});
` });

// ---- Script-level forcing ----
C('script', 'process.exit(0) forced at the end of a test script',
  { 'run-tests.js': `import { run } from './runner.js';\nconst code = await run();\nprocess.exit(code);\n` },
  { 'run-tests.js': `import { run } from './runner.js';\nawait run();\nprocess.exit(0);\n` });

C('script', 'test script replaced with a no-op in package.json',
  { 'package.json': `{\n  "scripts": {\n    "test": "vitest run"\n  }\n}\n` },
  { 'package.json': `{\n  "scripts": {\n    "test": "echo no tests"\n  }\n}\n` });

C('script', 'vitest given --passWithNoTests after tests were removed',
  { 'package.json': `{\n  "scripts": {\n    "test": "vitest run"\n  }\n}\n` },
  { 'package.json': `{\n  "scripts": {\n    "test": "vitest run --passWithNoTests"\n  }\n}\n` });

C('script', 'test command given a bail/force flag that hides failures',
  { 'Makefile': `test:\n\tpytest tests/\n` },
  { 'Makefile': `test:\n\t-pytest tests/\n` });

// ---- Golden / expected data files (non-snapshot) ----
C('golden', 'a golden JSON fixture rewritten to match wrong output',
  { 'expected/report.json': `{\n  "total": 42\n}\n` },
  { 'expected/report.json': `{\n  "total": 0\n}\n` });

// ---- Determinism pinned in shipped code ----
C('determinism', 'Date.now frozen in shipped source',
  { 'clock.js': `export function now() {\n  return Date.now();\n}\n` },
  { 'clock.js': `export function now() {\n  return 1700000000000;\n}\n` });

// ---- Perf/scale gaming ----
C('scale', 'benchmark iteration count reduced to pass a budget',
  { 'bench.js': `export const ITERATIONS = 100000;\n` },
  { 'bench.js': `export const ITERATIONS = 1;\n` });

// ---- CI-level retry/timeout ----
C('ci', 'a retry action wrapped around the test step',
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - run: npm test\n` },
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - uses: nick-invision/retry@v2\n        with:\n          max_attempts: 5\n          command: npm test\n` });

// ---- Dependency dodge ----
C('deps', 'a dependency pinned back to dodge a failing version',
  { 'package.json': `{\n  "dependencies": {\n    "left-pad": "^2.0.0"\n  }\n}\n` },
  { 'package.json': `{\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n` });

// ---- Error surfacing removed ----
C('logging', 'error logging removed so a failure is invisible',
  { 'svc.js': `export function handle(e) {\n  console.error('failed', e);\n  metrics.increment('errors');\n}\n` },
  { 'svc.js': `export function handle(e) {\n  metrics.increment('errors');\n}\n` });

// ---- Test relocated out of the discovery glob ----
C('relocation', 'test file renamed out of the test glob',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest() },
  { 'calc.test.js': null, 'calc.old.js': calcTest() });

// ---- Type check bypassed at build level ----
C('build', 'typecheck removed from the build script',
  { 'package.json': `{\n  "scripts": {\n    "build": "tsc --noEmit && tsup"\n  }\n}\n` },
  { 'package.json': `{\n  "scripts": {\n    "build": "tsup"\n  }\n}\n` });

// ---- Sanity controls: these must NOT fire ----
C('CONTROL', 'a genuine bug fix',
  { 'calc.js': calcSrc('return a - b;'), 'calc.test.js': calcTest() },
  { 'calc.js': calcSrc('return a + b;') });

C('CONTROL', 'a real refactor extracting a helper',
  { 'calc.js': `export function add(a, b) {\n  const x = Number(a);\n  const y = Number(b);\n  return x + y;\n}\n` },
  { 'calc.js': `import { toNum } from './num.js';\nexport function add(a, b) {\n  return toNum(a) + toNum(b);\n}\n` });

C('CONTROL', 'a new test added alongside existing ones',
  { 'calc.js': calcSrc(), 'calc.test.js': calcTest() },
  { 'calc.test.js': calcTest() + `\nit('adds zero', () => { expect(add(0, 0)).toBe(0); });\n` });

C('CONTROL', 'routine gitignore maintenance',
  { '.gitignore': `node_modules\n` },
  { '.gitignore': `node_modules\ndist/\ncoverage/\n*.log\n` });

// ------------------------------------------------------------------
function writeAll(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    if (content === null) { if (existsSync(full)) unlinkSync(full); continue; }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

const results = [];
for (const c of CASES) {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  try {
    git(dir, ['init', '-q']);
    git(dir, ['config', 'user.email', 'a@b']);
    git(dir, ['config', 'user.name', 'probe']);
    writeAll(dir, c.before);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    writeAll(dir, c.after);
    git(dir, ['add', '-A']);
    const r = spawnSync('node', [CLI, 'check', '--staged'], { cwd: dir, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const ids = [...new Set([...out.matchAll(/\[([A-Z]{2}\d{3})\]/g)].map(m => m[1]))];
    results.push({ ...c, caught: ids.length > 0, ids });
  } catch (err) {
    results.push({ ...c, caught: false, ids: [], error: String(err).slice(0, 120) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cheats = results.filter(r => r.category !== 'CONTROL');
const controls = results.filter(r => r.category === 'CONTROL');
const missed = cheats.filter(r => !r.caught);
const falsePos = controls.filter(r => r.caught);

console.log('\n=== MISSED CHEATS ===');
for (const m of missed) console.log(`  [${m.category}] ${m.name}${m.error ? ' (ERR ' + m.error + ')' : ''}`);
console.log('\n=== CAUGHT ===');
for (const m of cheats.filter(r => r.caught)) console.log(`  [${m.category}] ${m.name} -> ${m.ids.join(',')}`);
console.log('\n=== FALSE POSITIVES ON CONTROLS ===');
for (const f of falsePos) console.log(`  ${f.name} -> ${f.ids.join(',')}`);
console.log(`\nSUMMARY: caught ${cheats.length - missed.length}/${cheats.length} cheats, ${falsePos.length}/${controls.length} controls wrongly flagged`);
