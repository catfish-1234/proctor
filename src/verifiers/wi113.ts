import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, deletedLines, hasExplanation, isCommentLine, isWatchedSource, pathOf, withoutLiterals, withoutTrailingComment } from './wi-common.js';

/**
 * A failure avoided with a workload cut, dependency rollback, or fixed delay instead of a fix.
 * These are conservative before/after signals: a named benchmark budget must decrease, a concrete
 * semantic version must move backwards, or a new unexplained fixed wait must appear.
 */

const BENCH_PATH_RE = /(?:^|\/)(?:bench|benchmark|benchmarks|perf|performance|load|stress|fuzz)(?:\/|\.|$)/i;
const WORKLOAD_SETTING_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+)|\b(numRuns|iterations|runs|samples|repetitions|maxCases)\s*:\s*(\d+)/i;
const WORKLOAD_NAME_RE = /runs?|iterations?|samples?|repetitions?|cases?/i;
const FIXED_DELAY_RE =
  /\bsetTimeout\s*\([^,]+,\s*\d[\d_]*\s*\)|\b(?:time\.)?sleep\s*\(\s*\d[\d_.]*\s*\)/;

function workloadSetting(text: string): { key: string; value: number } | undefined {
  const match = WORKLOAD_SETTING_RE.exec(withoutTrailingComment(text));
  if (!match) return undefined;
  const key = (match[1] ?? match[3])!;
  if (!WORKLOAD_NAME_RE.test(key)) return undefined;
  return { key: key.toLowerCase(), value: Number(match[2] ?? match[4]) };
}

interface VersionEntry { name: string; version: [number, number, number] }

function versions(text: string): VersionEntry[] {
  const entries: VersionEntry[] = [];
  for (const match of text.matchAll(/"([@\w./-]+)"\s*:\s*"(?:[~^=v]*|>=?)([0-9]+)\.([0-9]+)\.([0-9]+)(?:-[^"]+)?"/g)) {
    if (match[1] === 'version') continue;
    entries.push({ name: match[1]!, version: [Number(match[2]), Number(match[3]), Number(match[4])] });
  }
  return entries;
}

function isLower(next: VersionEntry['version'], prior: VersionEntry['version']): boolean {
  for (let i = 0; i < 3; i++) {
    if (next[i]! === prior[i]!) continue;
    return next[i]! < prior[i]!;
  }
  return false;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath) continue;
    const normalized = filePath.replace(/\\/g, '/');

    if (/(?:^|\/)package\.json$/.test(normalized)) {
      const removed = file.chunks.flatMap(deletedLines).flatMap(line => versions(line.text));
      for (const added of file.chunks.flatMap(addedLines)) {
        for (const next of versions(added.text)) {
          const prior = removed.find(entry => entry.name === next.name);
          if (!prior || !isLower(next.version, prior.version)) continue;
          findings.push({
            verifierId: 'WI113',
            severity: 'error',
            file: filePath,
            line: added.line,
            message: `Dependency rollback: ${next.name} moved from ${prior.version.join('.')} to ${next.version.join('.')}, which can avoid a newly exposed failure without fixing it.`,
            suggestion: 'Keep the supported dependency version and fix the incompatibility. If a rollback is genuinely required, obtain a committed human approval with the incident rationale.',
          });
        }
      }
    }

    if (!isWatchedSource(context, filePath)) continue;

    for (const chunk of file.chunks) {
      const deleted = deletedLines(chunk);
      if (BENCH_PATH_RE.test(normalized)) {
        for (const added of addedLines(chunk)) {
          if (isCommentLine(added.text) || hasExplanation(added.text)) continue;
          const next = workloadSetting(added.text);
          if (!next) continue;
          const prior = deleted.map(line => workloadSetting(line.text)).find(setting => setting?.key === next.key);
          if (!prior || next.value >= prior.value) continue;
          findings.push({
            verifierId: 'WI113',
            severity: 'error',
            file: filePath,
            line: added.line,
            message: `Verification workload reduced: ${next.key} fell from ${prior.value} to ${next.value}, making the benchmark easier without improving the implementation.`,
            suggestion: 'Restore the workload and fix the performance or reliability problem it exposed.',
          });
        }
      }

      for (const added of addedLines(chunk)) {
        if (isCommentLine(added.text) || hasExplanation(added.text) || !FIXED_DELAY_RE.test(withoutLiterals(added.text))) continue;
        findings.push({
          verifierId: 'WI113',
          severity: 'warn',
          file: filePath,
          line: added.line,
          message: 'Fixed delay added: sleeping before continuing can hide a race by changing timing instead of waiting for the required state.',
          suggestion: 'Wait for the actual state, event, or bounded retry condition. If a protocol requires this delay, explain that requirement on the line.',
        });
      }
    }
  }

  return findings;
}

export const wi113: Verifier = { id: 'WI113', severity: 'error', run };
