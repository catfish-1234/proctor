import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, deletedLines, hasExplanation, isCommentLine, pathOf, withoutTrailingComment } from './wi-common.js';

/**
 * Test workload quietly reduced while the same test continues to run.
 *
 * A suite can keep every test name and every assertion yet exercise one input instead of a
 * thousand. Assertion and declaration counting cannot see that loss, so this verifier pairs the
 * before/after workload controls themselves.
 */

const WORKLOAD_SETTING_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+)|\b(numRuns|iterations|runs|samples|repetitions|maxCases)\s*:\s*(\d+)/i;
const WORKLOAD_NAME_RE = /runs?|iterations?|samples?|repetitions?|cases?/i;

function workloadSetting(text: string): { key: string; value: number } | undefined {
  const match = WORKLOAD_SETTING_RE.exec(withoutTrailingComment(text));
  if (!match) return undefined;
  const key = (match[1] ?? match[3])!;
  if (!WORKLOAD_NAME_RE.test(key)) return undefined;
  return {
    key: key.toLowerCase(),
    value: Number(match[2] ?? match[4]),
  };
}

function withoutLeadingSlice(text: string): string {
  return withoutTrailingComment(text).replace(/\.slice\(\s*0\s*,\s*\d+\s*\)/, '').replace(/\s+/g, ' ').trim();
}

function withoutFilter(text: string): string {
  return withoutTrailingComment(text).replace(/\.filter\([^)]*\)/, '').replace(/\s+/g, ' ').trim();
}

const PARAMETERIZED_RUNNER_RE = /\b(?:it|test)\.each\s*\(|pytest\.mark\.parametrize\b/;
const TABLE_ROW_RE = /^\s*\[[^\]]+\],?\s*$/;
const LOOP_BOUND_RE = /\bfor\s*\([^;]*;\s*([A-Za-z_$][\w$]*)\s*<\s*(\d+)\s*;/;

function inlineRowCount(text: string): number {
  return [...withoutTrailingComment(text).matchAll(/\[[^\[\]]+\]/g)].length;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!context.isTestFile(filePath)) continue;

    const allChanges = file.chunks.flatMap(chunk => chunk.changes);
    const parameterized = allChanges.some(change => PARAMETERIZED_RUNNER_RE.test(change.content));
    if (parameterized) {
      const removedRows = file.chunks.flatMap(deletedLines).filter(line => TABLE_ROW_RE.test(line.text));
      const addedRows = file.chunks.flatMap(addedLines).filter(line => TABLE_ROW_RE.test(line.text));
      const netRemoved = removedRows.filter(row => !addedRows.some(next => next.text.trim() === row.text.trim()));
      if (netRemoved.length > addedRows.filter(row => !removedRows.some(prior => prior.text.trim() === row.text.trim())).length) {
        findings.push({
          verifierId: 'RH014', severity: 'error', file: filePath, line: netRemoved[0]!.line,
          message: 'Test workload reduced: a row was removed from a parameterized test table while the test itself still runs.',
          suggestion: 'Restore the removed case and fix the behavior it exposed.',
        });
      }

      for (const added of file.chunks.flatMap(addedLines)) {
        const nextCount = inlineRowCount(added.text);
        if (nextCount === 0) continue;
        const prior = file.chunks.flatMap(deletedLines).find(line => inlineRowCount(line.text) > nextCount);
        if (!prior || hasExplanation(added.text)) continue;
        findings.push({
          verifierId: 'RH014', severity: 'error', file: filePath, line: added.line,
          message: `Test workload reduced: an inline parameter table fell from ${inlineRowCount(prior.text)} cases to ${nextCount}.`,
          suggestion: 'Restore the removed inline cases and fix the behavior they expose.',
        });
      }
    }

    for (const chunk of file.chunks) {
      const deleted = deletedLines(chunk);
      for (const added of addedLines(chunk)) {
        if (isCommentLine(added.text) || hasExplanation(added.text)) continue;

        const next = workloadSetting(added.text);
        if (next) {
          const prior = deleted.map(line => workloadSetting(line.text)).find(setting => setting?.key === next.key);
          if (prior && next.value < prior.value) {
            findings.push({
              verifierId: 'RH014',
              severity: 'error',
              file: filePath,
              line: added.line,
              message: `Test workload reduced: ${next.key} fell from ${prior.value} to ${next.value}, so the same test now exercises fewer cases.`,
              suggestion: 'Restore the workload and fix the failing case. If the count is intentionally changing, explain the new coverage strategy on the line.',
            });
            continue;
          }
        }

        const loop = LOOP_BOUND_RE.exec(withoutTrailingComment(added.text));
        if (loop) {
          const prior = deleted.map(line => LOOP_BOUND_RE.exec(withoutTrailingComment(line.text)))
            .find(match => match?.[1] === loop[1]);
          if (prior && Number(loop[2]) < Number(prior[2])) {
            findings.push({
              verifierId: 'RH014', severity: 'error', file: filePath, line: added.line,
              message: `Test workload reduced: loop bound fell from ${prior[2]} to ${loop[2]}, so fewer cases execute.`,
              suggestion: 'Restore the loop bound and fix the failing iteration.',
            });
            continue;
          }
        }

        if (!/\.slice\(\s*0\s*,\s*\d+\s*\)/.test(added.text)) continue;
        const paired = deleted.some(prior => withoutLeadingSlice(prior.text) === withoutLeadingSlice(added.text));
        if (!paired) continue;
        findings.push({
          verifierId: 'RH014',
          severity: 'error',
          file: filePath,
          line: added.line,
          message: 'Test workload reduced: a collection that was fully exercised is now sliced to an initial subset.',
          suggestion: 'Remove the slice and make every original case pass. If sampling is intentional, explain how the omitted cases remain covered.',
        });
      }

      for (const added of addedLines(chunk)) {
        if (isCommentLine(added.text) || hasExplanation(added.text) || !/\.filter\s*\(/.test(added.text)) continue;
        const paired = deleted.some(prior => withoutFilter(prior.text) === withoutFilter(added.text));
        if (!paired) continue;
        findings.push({
          verifierId: 'RH014', severity: 'error', file: filePath, line: added.line,
          message: 'Test workload reduced: a filter was inserted into a generated input source, excluding cases the property previously exercised.',
          suggestion: 'Remove the filter and fix the excluded input. If it is outside the documented domain, explain that invariant on the line.',
        });
      }
    }
  }

  return findings;
}

export const rh014: Verifier = { id: 'RH014', severity: 'error', run };
