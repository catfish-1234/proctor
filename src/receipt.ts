import type { Finding } from './types.js';

export type ReceiptStatus = 'honest-pass' | 'caught';

/**
 * A Receipt is the aggregate outcome of a `check` run: an "honest pass" or "caught" verdict,
 * plus the findings that produced it. This is the foundation the honest-pass badge is built on.
 */
export interface Receipt {
  status: ReceiptStatus;
  findings: Finding[];
  approvedCount: number; // findings a committed approval downgraded; a pass with these is not clean
  timestamp: string;   // ISO 8601
  signature?: string;  // reserved for a future signed-receipt mechanism, unused for now
}

/**
 * A run is "caught" if any Finding is error-severity, mirroring the CLI's own exit-code rule
 * (2 means a high-severity cheat). Warn-only or clean runs are "honest-pass": proctor found
 * nothing it considers a tampering cheat, even if warnings were reported.
 *
 * `approvedCount` is tracked separately because an approved finding is a real finding somebody
 * chose to let through. The run does not block, but it also does not earn the honest-pass badge.
 */
export function buildReceipt(findings: Finding[], now: Date = new Date()): Receipt {
  const status: ReceiptStatus = findings.some(f => f.severity === 'error') ? 'caught' : 'honest-pass';
  return {
    status,
    findings,
    approvedCount: findings.filter(f => f.approved).length,
    timestamp: now.toISOString(),
  };
}
