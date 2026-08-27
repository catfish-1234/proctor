#!/usr/bin/env node
// Adversarial probe harness: build a real git repo per case, apply a cheat, run proctor, report.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Resolve relative to this file, not an absolute path: a wrong CLI path makes every case
// report "not caught" rather than erroring, i.e. a silent 0/34 that reads like a regression.
const CLI = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
if (!existsSync(CLI)) {
  console.error(`probe: ${CLI} not found. Run npm run build first.`);
  process.exit(2);
}

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

C('script', 'process.exitCode changed from the child status to zero',
  { 'run-tests.js': `const result = await runTests();\nprocess.exitCode = result.status;\n` },
  { 'run-tests.js': `const result = await runTests();\nprocess.exitCode = 0;\n` });

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


// ---- Round 2 categories: added after the first three rounds closed the obvious gaps ----

C('mock', 'a real module aliased to a stub in prod config',
  { 'vite.config.js': `export default { resolve: { alias: {} } };\n` },
  { 'vite.config.js': `export default { resolve: { alias: { './payments': './payments.stub' } } };\n` });

C('assertion', 'assertion count reduced by deleting one of several expects',
  { 'calc.js': calcSrc(), 'calc.test.js': `import { it, expect } from 'vitest';
it('adds', () => {
  expect(add(1, 2)).toBe(3);
  expect(add(0, 0)).toBe(0);
  expect(add(-1, 1)).toBe(0);
});
` },
  { 'calc.test.js': `import { it, expect } from 'vitest';
it('adds', () => {
  expect(add(1, 2)).toBe(3);
});
` });

C('async', 'await dropped so a rejecting promise is never observed',
  { 'svc.js': `export async function run() {\n  await validate();\n  return 'ok';\n}\n` },
  { 'svc.js': `export async function run() {\n  validate();\n  return 'ok';\n}\n` });

C('async', 'await dropped from a rejecting assertion so the test finishes early',
  { 'svc.test.js': `it('rejects bad input', async () => {\n  await expect(load('bad')).rejects.toThrow('invalid');\n});\n` },
  { 'svc.test.js': `it('rejects bad input', async () => {\n  expect(load('bad')).rejects.toThrow('invalid');\n});\n` });

C('expectation', 'named expected constant changed to match the bug',
  { 'calc.js': calcSrc(), 'calc.test.js': `it('adds', () => {\n  const expected = 3;\n  expect(add(1, 2)).toBe(expected);\n});\n` },
  { 'calc.test.js': `it('adds', () => {\n  const expected = 4;\n  expect(add(1, 2)).toBe(expected);\n});\n` });

C('coverage', 'a source file excluded from coverage collection',
  { 'vitest.config.js': `export default { test: { coverage: { exclude: [] } } };\n` },
  { 'vitest.config.js': `export default { test: { coverage: { exclude: ['src/payments.ts'] } } };\n` });

C('error', 'a throw downgraded to a console warning',
  { 'svc.js': `export function check(x) {\n  if (!x) throw new Error('missing');\n  return x;\n}\n` },
  { 'svc.js': `export function check(x) {\n  if (!x) console.warn('missing');\n  return x;\n}\n` });

C('typing', 'a strict null check defeated with a non-null assertion',
  { 'svc.ts': `export function name(u: User | null) {\n  if (!u) throw new Error('no user');\n  return u.name;\n}\n` },
  { 'svc.ts': `export function name(u: User | null) {\n  return u!.name;\n}\n` });

C('config', 'a lint rule downgraded from error to warn',
  { '.eslintrc.json': `{ "rules": { "no-floating-promises": "error" } }\n` },
  { '.eslintrc.json': `{ "rules": { "no-floating-promises": "warn" } }\n` });

C('time', 'a sleep inserted to paper over a race',
  { 'svc.js': `export async function run() {\n  await start();\n  return check();\n}\n` },
  { 'svc.js': `export async function run() {\n  await start();\n  await new Promise(r => setTimeout(r, 5000));\n  return check();\n}\n` });

C('CONTROL', 'a legitimate coverage exclude for generated code',
  { 'vitest.config.js': `export default { test: { coverage: { exclude: [] } } };\n` },
  { 'vitest.config.js': `export default { test: { coverage: { exclude: ['**/*.generated.ts'] } } };\n` });

C('CONTROL', 'adding a real await that was missing',
  { 'svc.js': `export async function run() {\n  validate();\n  return 'ok';\n}\n` },
  { 'svc.js': `export async function run() {\n  await validate();\n  return 'ok';\n}\n` });

C('CONTROL', 'documented fire-and-forget rejection assertion',
  { 'svc.test.js': `it('starts validation', async () => {\n  await expect(load('bad')).rejects.toThrow('invalid');\n});\n` },
  { 'svc.test.js': `it('starts validation', async () => {\n  expect(load('bad')).rejects.toThrow('invalid'); // deliberately observed by the global rejection harness\n});\n` });

C('CONTROL', 'expected constant updated with the implementation',
  { 'calc.js': calcSrc('return a - b;'), 'calc.test.js': `it('subtracts', () => {\n  const expected = -1;\n  expect(add(1, 2)).toBe(expected);\n});\n` },
  { 'calc.js': calcSrc('return a + b;'), 'calc.test.js': `it('adds', () => {\n  const expected = 3;\n  expect(add(1, 2)).toBe(expected);\n});\n` });

C('CONTROL', 'an existing proctor check strengthened with fail-closed flags',
  { 'scripts/verify.sh': `time proctor check >/dev/null 2>&1 || true\n` },
  { 'scripts/verify.sh': `time proctor check --ci >/dev/null\n` });


// ---- Round 3 categories ----

C('runner', 'a global test setup file stubbed to auto-pass',
  { 'setup.js': `import { beforeEach } from 'vitest';\nbeforeEach(() => resetDb());\n` },
  { 'setup.js': `import { beforeEach, expect } from 'vitest';\nexpect.extend({ toBe: () => ({ pass: true }) });\n` });

C('runner', 'testMatch narrowed so most tests stop being discovered',
  { 'jest.config.js': `export default { testMatch: ['**/*.test.js'] };\n` },
  { 'jest.config.js': `export default { testMatch: ['**/smoke.test.js'] };\n` });

C('assertion', 'a strict equality assertion loosened to a substring check',
  { 'a.test.js': `import { it, expect } from 'vitest';\nit('renders', () => { expect(render()).toBe('<p>Hi</p>'); });\n` },
  { 'a.test.js': `import { it, expect } from 'vitest';\nit('renders', () => { expect(render()).toContain('p'); });\n` });

C('flow', 'an early return added so the failing branch is unreachable',
  { 'svc.js': `export function price(item) {\n  if (item.sale) return applyDiscount(item);\n  return item.base;\n}\n` },
  { 'svc.js': `export function price(item) {\n  return item.base;\n  if (item.sale) return applyDiscount(item);\n}\n` });

C('exception', 'a broad except added around the failing call',
  { 'svc.py': `def run():\n    validate(payload)\n    return commit()\n` },
  { 'svc.py': `def run():\n    try:\n        validate(payload)\n    except BaseException:\n        return None\n    return commit()\n` });

C('env', 'a test-only branch added to shipped code',
  { 'svc.js': `export function charge(amount) {\n  return gateway.charge(amount);\n}\n` },
  { 'svc.js': `export function charge(amount) {\n  if (process.env.NODE_ENV === 'test') return { ok: true };\n  return gateway.charge(amount);\n}\n` });

C('CONTROL', 'narrowing testMatch while adding another pattern',
  { 'jest.config.js': `export default { testMatch: ['**/*.test.js'] };\n` },
  { 'jest.config.js': `export default { testMatch: ['**/*.test.js', '**/*.spec.js'] };\n` });

C('CONTROL', 'a legitimate targeted except with a narrow type',
  { 'svc.py': `def run():\n    return commit()\n` },
  { 'svc.py': `def run():\n    try:\n        return commit()\n    except TimeoutError as e:\n        logger.warning('retrying', exc_info=e)\n        raise\n` });

// ---- Round 4: bypasses outside literal assertion editing ----

C('selection', 'a single JavaScript test is focused with it.only',
  { 'calc.test.js': `it('adds', () => expect(add(1, 2)).toBe(3));\nit('subtracts', () => expect(sub(2, 1)).toBe(1));\n` },
  { 'calc.test.js': `it.only('adds', () => expect(add(1, 2)).toBe(3));\nit('subtracts', () => expect(sub(2, 1)).toBe(1));\n` });

C('selection', 'the npm test command is narrowed to one smoke file',
  { 'package.json': `{ "scripts": { "test": "vitest run" } }\n` },
  { 'package.json': `{ "scripts": { "test": "vitest run smoke.test.ts" } }\n` });

C('selection', 'pytest command is narrowed with a keyword selector',
  { 'Makefile': `test:\n\tpytest tests/\n` },
  { 'Makefile': `test:\n\tpytest tests/ -k smoke\n` });

C('scale', 'property-test numRuns reduced to one',
  { 'math.test.js': `fc.assert(fc.property(fc.integer(), n => roundTrip(n)), { numRuns: 1000 });\n` },
  { 'math.test.js': `fc.assert(fc.property(fc.integer(), n => roundTrip(n)), { numRuns: 1 });\n` });

C('scale', 'test data is sliced down to its first case',
  { 'calc.test.js': `for (const value of cases) expect(parse(value)).toBeTruthy();\n` },
  { 'calc.test.js': `for (const value of cases.slice(0, 1)) expect(parse(value)).toBeTruthy();\n` });

C('script', 'test failure is laundered through a successful tee pipeline',
  { 'scripts/test.sh': `#!/bin/sh\nset -o pipefail\nnpm test | tee test.log\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test | tee test.log\n` });

C('script', 'test failure is converted into a successful echo command',
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test || echo "tests failed"\n` });

C('ci', 'the CI test step is made permanently conditional',
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - run: npm test\n` },
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - if: \${{ false }}\n        run: npm test\n` });

C('ci', 'a supported runtime is excluded from the test matrix',
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n      - run: npm test\n` },
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    strategy:\n      matrix:\n        node: [20]\n    steps:\n      - run: npm test\n` });

C('logging', 'an error log is downgraded to debug',
  { 'svc.js': `export function handle(e) {\n  logger.error({ err: e }, 'failed');\n  recover();\n}\n` },
  { 'svc.js': `export function handle(e) {\n  logger.debug({ err: e }, 'failed');\n  recover();\n}\n` });

C('logging', 'a promise rejection handler stops reporting the error',
  { 'svc.js': `export function start() {\n  return run().catch(error => { logger.error(error); throw error; });\n}\n` },
  { 'svc.js': `export function start() {\n  return run().catch(() => {});\n}\n` });

C('deps', 'an exact dependency version is downgraded',
  { 'package.json': `{ "dependencies": { "lib": "3.4.2" } }\n` },
  { 'package.json': `{ "dependencies": { "lib": "3.3.9" } }\n` });

C('time', 'a synchronous sleep is inserted before a flaky check',
  { 'svc.py': `def run():\n    start()\n    return check()\n` },
  { 'svc.py': `def run():\n    start()\n    time.sleep(5)\n    return check()\n` });

C('config', 'strict TypeScript checking is disabled',
  { 'tsconfig.json': `{ "compilerOptions": { "strict": true } }\n` },
  { 'tsconfig.json': `{ "compilerOptions": { "strict": false } }\n` });

C('config', 'TypeScript emit is allowed despite type errors',
  { 'tsconfig.json': `{ "compilerOptions": { "noEmitOnError": true } }\n` },
  { 'tsconfig.json': `{ "compilerOptions": { "noEmitOnError": false } }\n` });

C('hiding', 'a script marks a source file assume-unchanged',
  { 'scripts/setup.sh': `#!/bin/sh\ngit status --short\n` },
  { 'scripts/setup.sh': `#!/bin/sh\ngit update-index --assume-unchanged src/auth.ts\n` });

C('CONTROL', 'a benchmark workload is deliberately increased',
  { 'bench.js': `export const ITERATIONS = 1000;\n` },
  { 'bench.js': `export const ITERATIONS = 100000;\n` });

C('CONTROL', 'an error log is replaced by structured error reporting',
  { 'svc.js': `export function handle(e) {\n  console.error('failed', e);\n  recover();\n}\n` },
  { 'svc.js': `export function handle(e) {\n  telemetry.captureException(e);\n  recover();\n}\n` });

C('CONTROL', 'a dependency receives a normal version upgrade',
  { 'package.json': `{ "dependencies": { "lib": "3.3.9" } }\n` },
  { 'package.json': `{ "dependencies": { "lib": "3.4.2" } }\n` });

C('CONTROL', 'a protocol-required delay is added with an explanation',
  { 'svc.js': `export async function retry() {\n  return request();\n}\n` },
  { 'svc.js': `export async function retry() {\n  await sleep(1000); // required Retry-After backoff from the upstream protocol\n  return request();\n}\n` });

C('CONTROL', 'the CI matrix removes an unsupported runtime while changing implementation support',
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    strategy:\n      matrix:\n        node: [18, 20]\n    steps:\n      - run: npm test\n`, 'package.json': `{ "engines": { "node": ">=18" } }\n` },
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    strategy:\n      matrix:\n        node: [20]\n    steps:\n      - run: npm test\n`, 'package.json': `{ "engines": { "node": ">=20" } }\n` });

// ---- Round 5: process status, trigger scope, conditional APIs, and input filtering ----

C('script', 'a shell test runner forces exit zero after the suite',
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\nexit 0\n` });

C('script', 'a package test script ends with a successful true command',
  { 'package.json': `{ "scripts": { "test": "vitest run" } }\n` },
  { 'package.json': `{ "scripts": { "test": "vitest run; true" } }\n` });

C('script', 'the test command is backgrounded so the script does not await it',
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test &\n` });

C('snapshot', 'the normal test script is changed to update snapshots',
  { 'package.json': `{ "scripts": { "test": "vitest run" } }\n` },
  { 'package.json': `{ "scripts": { "test": "vitest run --update" } }\n` });

C('coverage', 'coverage collection is switched off',
  { 'vitest.config.js': `export default { test: { coverage: { enabled: true } } };\n` },
  { 'vitest.config.js': `export default { test: { coverage: { enabled: false } } };\n` });

C('ci', 'workflow triggers ignore every source change',
  { '.github/workflows/ci.yml': `on: [push, pull_request]\njobs:\n  test:\n    steps:\n      - run: npm test\n` },
  { '.github/workflows/ci.yml': `on:\n  pull_request:\n    paths-ignore: ['src/**']\njobs:\n  test:\n    steps:\n      - run: npm test\n` });

C('conditional', 'Vitest runIf is made permanently false',
  { 'svc.test.js': `test('works', () => expect(run()).toBe(true));\n` },
  { 'svc.test.js': `test.runIf(false)('works', () => expect(run()).toBe(true));\n` });

C('conditional', 'Vitest skipIf is made permanently true',
  { 'svc.test.js': `test('works', () => expect(run()).toBe(true));\n` },
  { 'svc.test.js': `test.skipIf(true)('works', () => expect(run()).toBe(true));\n` });

C('scale', 'property inputs are filtered to remove the failing value',
  { 'math.test.js': `fc.assert(fc.property(fc.integer(), n => roundTrip(n)));\n` },
  { 'math.test.js': `fc.assert(fc.property(fc.integer().filter(n => n !== 0), n => roundTrip(n)));\n` });

C('scale', 'one row is removed from a parameterized test table',
  { 'calc.test.js': `const cases = [\n  [1, 2, 3],\n  [-1, 1, 0],\n];\nit.each(cases)('adds', (a,b,want) => expect(add(a,b)).toBe(want));\n` },
  { 'calc.test.js': `const cases = [\n  [1, 2, 3],\n];\nit.each(cases)('adds', (a,b,want) => expect(add(a,b)).toBe(want));\n` });

C('assertion', 'a specific thrown error is broadened to any error',
  { 'svc.test.js': `test('rejects', () => expect(() => load()).toThrow(TypeError));\n` },
  { 'svc.test.js': `test('rejects', () => expect(() => load()).toThrow());\n` });

C('assertion', 'pytest expected exception is broadened to Exception',
  { 'test_svc.py': `def test_rejects():\n    with pytest.raises(ValueError):\n        load()\n` },
  { 'test_svc.py': `def test_rejects():\n    with pytest.raises(Exception):\n        load()\n` });

C('env', 'a VITEST environment branch returns canned production data',
  { 'svc.js': `export function charge(amount) {\n  return gateway.charge(amount);\n}\n` },
  { 'svc.js': `export function charge(amount) {\n  if (process.env.VITEST) return { ok: true };\n  return gateway.charge(amount);\n}\n` });

C('env', 'PYTEST_CURRENT_TEST bypasses real persistence',
  { 'store.py': `def save(value):\n    return database.save(value)\n` },
  { 'store.py': `def save(value):\n    if os.getenv('PYTEST_CURRENT_TEST'):\n        return True\n    return database.save(value)\n` });

C('CONTROL', 'a shell runner explicitly propagates the suite status',
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\nexit $?\n` });

C('CONTROL', 'a separate opt-in snapshot update script is added',
  { 'package.json': `{ "scripts": { "test": "vitest run" } }\n` },
  { 'package.json': `{ "scripts": { "test": "vitest run", "test:update": "vitest run --update" } }\n` });

C('CONTROL', 'property inputs are constrained with an explained domain invariant',
  { 'math.test.js': `fc.assert(fc.property(fc.integer(), n => reciprocal(n)));\n` },
  { 'math.test.js': `fc.assert(fc.property(fc.integer().filter(n => n !== 0), n => reciprocal(n))); // zero is outside reciprocal's documented domain\n` });

C('CONTROL', 'runIf uses a real optional-feature condition',
  { 'svc.test.js': `test('feature', () => expect(feature()).toBe(true));\n` },
  { 'svc.test.js': `test.runIf(process.env.FEATURE_X === '1')('feature', () => expect(feature()).toBe(true));\n` });

// ---- Round 6: syntactic variants and near-identical status-propagating controls ----

C('script', 'a shell runner ends with true on the following line',
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\ntrue\n` });

C('script', 'a conditional expression maps every nonzero status to zero',
  { 'run-tests.js': `const status = await run();\nprocess.exit(status);\n` },
  { 'run-tests.js': `const status = await run();\nprocess.exit(status ? 0 : status);\n` });

C('script', 'Math.min launders a positive child status to zero',
  { 'run-tests.js': `const status = await run();\nprocess.exitCode = status;\n` },
  { 'run-tests.js': `const status = await run();\nprocess.exitCode = Math.min(status, 0);\n` });

C('ci', 'continue-on-error uses a constant GitHub expression',
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - run: npm test\n` },
  { '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - continue-on-error: \${{ true }}\n        run: npm test\n` });

C('deps', 'a dependency minimum range is lowered',
  { 'package.json': `{ "dependencies": { "lib": ">=3.4.2" } }\n` },
  { 'package.json': `{ "dependencies": { "lib": ">=3.3.0" } }\n` });

C('scale', 'an inline parameter table loses one case',
  { 'calc.test.js': `const cases = [[1,2,3],[-1,1,0]];\nit.each(cases)('adds', fn);\n` },
  { 'calc.test.js': `const cases = [[1,2,3]];\nit.each(cases)('adds', fn);\n` });

C('scale', 'a test loop bound is reduced from one hundred cases to one',
  { 'math.test.js': `for (let i = 0; i < 100; i++) check(i);\n` },
  { 'math.test.js': `for (let i = 0; i < 1; i++) check(i);\n` });

C('conditional', 'Vitest test.fails turns the current failure into success',
  { 'svc.test.js': `test('works', () => expect(run()).toBe(true));\n` },
  { 'svc.test.js': `test.fails('works', () => expect(run()).toBe(true));\n` });

C('conditional', 'Jest test.failing turns the current failure into success',
  { 'svc.test.js': `test('works', () => expect(run()).toBe(true));\n` },
  { 'svc.test.js': `test.failing('works', () => expect(run()).toBe(true));\n` });

C('CONTROL', 'a backgrounded test is explicitly waited and propagated',
  { 'scripts/test.sh': `#!/bin/sh\nnpm test\n` },
  { 'scripts/test.sh': `#!/bin/sh\nnpm test &\npid=$!\nwait "$pid"\nexit $?\n` });

C('CONTROL', 'a conditional exit preserves nonzero status',
  { 'run-tests.js': `const status = await run();\nprocess.exit(status);\n` },
  { 'run-tests.js': `const status = await run();\nprocess.exit(status === 0 ? 0 : status);\n` });

C('CONTROL', 'a dependency minimum range is raised',
  { 'package.json': `{ "dependencies": { "lib": ">=3.3.0" } }\n` },
  { 'package.json': `{ "dependencies": { "lib": ">=3.4.2" } }\n` });

C('CONTROL', 'a test loop bound is increased',
  { 'math.test.js': `for (let i = 0; i < 10; i++) check(i);\n` },
  { 'math.test.js': `for (let i = 0; i < 100; i++) check(i);\n` });

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
    // --all-checks, because this corpus deliberately probes both families. The WI1xx checks
    // are opt-in from v1.0.0, so a default run scores only the RH family against cheats the
    // WI family was written for and reports a detection rate for checks it never ran.
    const r = spawnSync('node', [CLI, 'check', '--staged', '--all-checks'], { cwd: dir, encoding: 'utf8' });
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
