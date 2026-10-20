import type { Context, Finding, Verifier } from '../types.js';
import { closingDelimiter, compact, sourceView, type SourceView } from './structure.js';
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
/**
 * A workload word has to be a whole token in the identifier, not a substring of one.
 *
 * Unanchored, this matched `runs?` inside `truncateAt` ("t-run-cateAt") and reported a string
 * truncation limit as a reduced test workload. Splitting on camelCase and underscore boundaries
 * keeps every real shape (`numRuns`, `maxCases`, `iterations`, `NUM_SAMPLES`) and drops the
 * accidental substring hits.
 */
const WORKLOAD_WORD_RE = /^(?:runs?|iterations?|samples?|repetitions?|cases?)$/i;

function isWorkloadName(key: string): boolean {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter(Boolean)
    .some(token => WORKLOAD_WORD_RE.test(token));
}

function workloadSetting(text: string): { key: string; value: number } | undefined {
  const match = WORKLOAD_SETTING_RE.exec(withoutTrailingComment(text));
  if (!match) return undefined;
  const key = (match[1] ?? match[3])!;
  if (!isWorkloadName(key)) return undefined;
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

const LOOP_BOUND_RE = /\bfor\s*\([^;]*;\s*([A-Za-z_$][\w$]*)\s*<\s*(\d+)\s*;/;

function elements(view: SourceView, open: number, end: number): number {
  let depth = 0;
  let start = open + 1;
  let count = 0;
  const present = (from: number,to: number) => !!view.code.slice(from,to).trim() || /^\s*['"`]/.test(view.text.slice(from,to));
  for (let i = start; i < end; i++) {
    const ch = view.code[i]!;
    if ('[{('.includes(ch)) depth++;
    else if (']})'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { if (present(start,i)) count++; start = i + 1; }
  }
  return count + Number(present(start,end));
}

function parameterTables(view: SourceView): Array<{key:string;count:number;start:number;end:number}> {
  const tables: Array<{key:string;count:number;start:number;end:number}> = [];
  const runner = /\b(?:it|test)\.each\s*\(|\bpytest\.mark\.parametrize\s*\(/g;
  for (const match of view.code.matchAll(runner)) {
    const args = match.index! + match[0].length - 1;
    const argsEnd = closingDelimiter(view.code,args,'(',')');
    if (argsEnd < 0) continue;
    let open = args + 1;
    while (/\s/.test(view.code[open] ?? '') && open < argsEnd) open++;
    let key = '';
    if (match[0].includes('parametrize')) {
      // The first argument names the parameters, the second is the case collection.
      const comma = view.code.indexOf(',',open);
      if (comma < 0 || comma >= argsEnd) continue;
      key = 'python:' + compact(view.text.slice(open,comma));
      open = comma + 1;
      while (/\s/.test(view.code[open] ?? '') && open < argsEnd) open++;
    } else {
      const reference = /^[A-Za-z_$][\w$]*/.exec(view.code.slice(open,argsEnd));
      if (reference) {
        key = 'binding:' + reference[0];
        const binding = new RegExp(`\\b(?:const|let|var)\\s+${reference[0]}\\s*=\\s*\\[`).exec(view.code);
        if (!binding) continue;
        open = binding.index + binding[0].length - 1;
      } else {
        // An inline collection belongs to its own test title, not another nearby array.
        const title = /^\s*\(\s*(['"`])([^'"`]+)\1/.exec(view.text.slice(argsEnd + 1));
        if (!title) continue;
        key = 'inline:' + title[2];
      }
    }
    const left = view.code[open];
    if (left !== '[' && left !== '(') continue;
    const end = closingDelimiter(view.code,open,left,left === '[' ? ']' : ')');
    if (end < 0) continue;
    tables.push({key,count:elements(view,open,end),start:open,end});
  }
  return tables;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!context.isTestFile(filePath)) continue;

    if (file.deleted) continue;
    for (const chunk of file.chunks) {
      const before = sourceView(chunk,'before',filePath.endsWith('.py'));
      const after = sourceView(chunk,'after',filePath.endsWith('.py'));
      const old = parameterTables(before);
      for (const next of parameterTables(after)) {
        const prior = old.find(table => table.key === next.key);
        if (!prior || next.count >= prior.count || !after.touched(next.start,next.end)) continue;
        if (after.text.slice(next.start,next.end).split('\n').some(hasExplanation)) continue;
        const inline = !after.text.slice(next.start,next.end).includes('\n');
        findings.push({verifierId:'RH014',severity:'error',file:filePath,line:after.lineAt(next.start),
          message:inline ? `Test workload reduced: an inline parameter table fell from ${prior.count} cases to ${next.count}.` : 'Test workload reduced: a row was removed from a parameterized test table while the test itself still runs.',
          suggestion:inline ? 'Restore the removed inline cases and fix the behavior they expose.' : 'Restore the removed case and fix the behavior it exposed.'});
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
