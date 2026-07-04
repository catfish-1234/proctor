import type { Finding } from '../types.js';

export function jsonReport(findings: Finding[]): string {
  return JSON.stringify(findings, null, 2);
}
