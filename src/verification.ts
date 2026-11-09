import type { DynamicResult } from './dynamic/runner.js';
import type { Finding } from './types.js';

/** Completeness of the requested observations, never proof of intent or authentic execution. */
export interface VerificationEvidence {
  status: 'not-requested' | 'complete' | 'incomplete' | 'review-required';
  reasons: string[];
  dynamic?: DynamicResult;
  limits: string;
}
export function verificationEvidence(dynamic?: DynamicResult): VerificationEvidence {
  const limits = 'Project-controlled reports and local Git inputs are not authenticated execution or independently trusted baselines. No result establishes intent or complete behavioral correctness.';
  if (!dynamic) return { status: 'not-requested', reasons: [], limits };
  if (dynamic.status === 'skipped') return { status: 'incomplete', reasons: [dynamic.reason ?? 'Dynamic execution did not complete'], dynamic, limits };
  const original = dynamic.runs.find(r => r.label === 'original tests / original code');
  const current = dynamic.runs.find(r => r.label === 'new tests / new code');
  if (!original || !current) return { status: 'incomplete', reasons: ['Required original/current observations are missing'], dynamic, limits };
  const reasons: string[] = [];
  if (dynamic.runs.some(r => r.label.includes('repeat ') && (r.exitCode !== 0 || r.failed.length))) reasons.push('Repeated current-suite observations include failures; order dependence or flakiness is possible');
  if (current.exitCode !== 0 || current.failed.length) reasons.push('The current test suite did not pass');
  const cross = dynamic.runs.find(r => r.label === 'original tests + baseline controls / new code');
  if (cross?.failed.some(id => original.passed.includes(id))) reasons.push('Previously passing baseline tests fail against new code under baseline controls; a legitimate behavior/config change is possible');
  return { status: reasons.length ? 'review-required' : 'complete', reasons, dynamic, limits };
}

export function checkExitCode(findings: Finding[], ci: boolean, required: boolean, evidence: VerificationEvidence): number {
  if (findings.some(f => f.severity === 'error')) return 2;
  if (required && evidence.status !== 'complete') return 3;
  return !ci && findings.some(f => f.severity === 'warn' && !['DY002', 'DY004'].includes(f.verifierId)) ? 1 : 0;
}

/** Explicit versioned envelope. Legacy --json remains the findings array. */
export function resultReport(findings: Finding[], selected: string[], evidence: VerificationEvidence, required: boolean, exitCode: number, staticFailure?: string): string {
  return JSON.stringify({ schemaVersion: 1, status: findings.length ? 'findings' : evidence.status === 'incomplete' ? 'incomplete' : evidence.status === 'review-required' ? 'review-required' : 'no-findings', findings,
    checks: { static: { status: staticFailure ? 'incomplete' : 'completed', selected, ...(staticFailure ? { reason: staticFailure } : {}) }, dynamic: evidence.dynamic ?? { status: 'not-requested' } }, verification: { status: evidence.status, reasons: evidence.reasons, limits: evidence.limits }, requiredDynamic: required, exitCode }, null, 2);
}
