import type { Context, Finding, Verifier } from '../types.js';

const RETRY_TIMES_RE = /jest\.retryTimes\(\s*(\d+)/;
const SET_TIMEOUT_RE = /jest\.setTimeout\(\s*(\d+)/;
const PYTEST_FLAKY_RE = /@pytest\.mark\.flaky\(\s*reruns\s*=\s*(\d+)/;
const PYTEST_TIMEOUT_RE = /@pytest\.mark\.timeout\(\s*(\d+)/;
// Vitest per-test/suite retry option (`it('x', { retry: 3 }, fn)`) and mocha `this.retries(3)`.
// VITEST_RETRY is gated to a test-declaration line (below) so an unrelated `{ retry: 3 }` on an
// HTTP-client/DB-pool options object in a test file isn't mistaken for a test retry. Tradeoff:
// a retry option split onto its own line (multi-line `it(` call) is not detected; avoiding the
// false positive is worth missing that rarer form, since this signal is only warn-severity.
const VITEST_RETRY_RE = /\bretry:\s*(\d+)/;
const TEST_DECL_LINE_RE = /\b(?:it|test|describe)\s*\(/;
const MOCHA_RETRIES_RE = /\bthis\.retries\(\s*(\d+)/;

const RETRY_THRESHOLD = 2; // a single retry is common for genuinely flaky infra; 2+ is abuse
const TIMEOUT_MS_THRESHOLD = 120_000; // 2 minutes
const TIMEOUT_S_THRESHOLD = 120;

// Greedy `[^)]*` up to the closing paren is linear (no whitespace/lazy overlap → ReDoS-safe);
// the captured value is passed through normalize()/assertionLiterals which trim surrounding space.
const NETWORK_MOCK_RE = /\.(?:mockResolvedValue|mockReturnValue)(?:Once)?\(([^)]*)\)|\.reply\(\s*\d+\s*,([^)]*)\)/;
const ASSERTION_LITERAL_RE = /\.(?:toBe|toEqual)\(([^)]*)\)|assertEqual\([^,]+,([^)]*)\)/;

function normalize(s: string): string {
  return s.trim().replace(/;$/, '');
}

/**
 * RH010 catches failure masking, using three independent, conservative signals:
 * retry-count abuse, large timeout increases, and a network response mocked to return
 * literally the same value the test then asserts against (the mock manufactures the answer
 * instead of exercising real behavior).
 */
function run(context: Context): Finding[] {
  const files = context.files;
  const ctx = context;
  const findings: Finding[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    if (!ctx.isTestFile(filePath)) continue;

    const assertionLiterals = new Set<string>();
    for (const chunk of file.chunks) {
      for (const add of chunk.changes.filter(c => c.type === 'add')) {
        const m = add.content.match(ASSERTION_LITERAL_RE);
        const lit = m?.[1] ?? m?.[2];
        if (lit !== undefined) assertionLiterals.add(normalize(lit));
      }
    }

    for (const chunk of file.chunks) {
      for (const add of chunk.changes.filter(c => c.type === 'add')) {
        const content = add.content;
        const line = (add as { ln: number }).ln;

        const retryM = content.match(RETRY_TIMES_RE);
        if (retryM && Number(retryM[1]) >= RETRY_THRESHOLD) {
          findings.push({
            verifierId: 'RH010',
            severity: 'warn',
            file: filePath,
            line,
            message: `jest.retryTimes(${retryM[1]!}) added — masks a flaky or failing test by re-running it instead of fixing it.`,
            suggestion: 'Fix the underlying flakiness instead of retrying past it.',
          });
          continue;
        }

        const vitestRetryM = (TEST_DECL_LINE_RE.test(content) ? content.match(VITEST_RETRY_RE) : null) ?? content.match(MOCHA_RETRIES_RE);
        if (vitestRetryM && Number(vitestRetryM[1]) >= RETRY_THRESHOLD) {
          findings.push({
            verifierId: 'RH010',
            severity: 'warn',
            file: filePath,
            line,
            message: `Test retry count of ${vitestRetryM[1]!} added — masks a flaky or failing test by re-running it instead of fixing it.`,
            suggestion: 'Fix the underlying flakiness instead of retrying past it.',
          });
          continue;
        }

        const timeoutM = content.match(SET_TIMEOUT_RE);
        if (timeoutM && Number(timeoutM[1]) >= TIMEOUT_MS_THRESHOLD) {
          findings.push({
            verifierId: 'RH010',
            severity: 'warn',
            file: filePath,
            line,
            message: `jest.setTimeout(${timeoutM[1]!}) added — an unusually large timeout can mask a hanging or failing operation instead of fixing it.`,
            suggestion: 'Investigate why the test needs a long timeout instead of masking it.',
          });
          continue;
        }

        const flakyM = content.match(PYTEST_FLAKY_RE);
        if (flakyM && Number(flakyM[1]) >= RETRY_THRESHOLD) {
          findings.push({
            verifierId: 'RH010',
            severity: 'warn',
            file: filePath,
            line,
            message: `@pytest.mark.flaky(reruns=${flakyM[1]!}) added — masks a flaky or failing test by re-running it instead of fixing it.`,
            suggestion: 'Fix the underlying flakiness instead of retrying past it.',
          });
          continue;
        }

        const pyTimeoutM = content.match(PYTEST_TIMEOUT_RE);
        if (pyTimeoutM && Number(pyTimeoutM[1]) >= TIMEOUT_S_THRESHOLD) {
          findings.push({
            verifierId: 'RH010',
            severity: 'warn',
            file: filePath,
            line,
            message: `@pytest.mark.timeout(${pyTimeoutM[1]!}) added — an unusually large timeout can mask a hanging or failing operation instead of fixing it.`,
            suggestion: 'Investigate why the test needs a long timeout instead of masking it.',
          });
          continue;
        }

        const mockM = content.match(NETWORK_MOCK_RE);
        const mockLit = mockM?.[1] ?? mockM?.[2];
        if (mockLit !== undefined && assertionLiterals.has(normalize(mockLit))) {
          findings.push({
            verifierId: 'RH010',
            severity: 'warn',
            file: filePath,
            line,
            message: `Network response mocked to return ${normalize(mockLit)}, the exact value the test then asserts against — the test may not exercise real behavior.`,
            suggestion: 'Mock only the network boundary with representative data, not the exact expected assertion value.',
          });
        }
      }
    }
  }

  return findings;
}

export const rh010: Verifier = { id: 'RH010', severity: 'warn', run };
