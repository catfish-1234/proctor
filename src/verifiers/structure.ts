import type { ParsedFile } from '../diff.js';
import { body } from './wi-common.js';

type Chunk = ParsedFile['chunks'][number];
export interface SourceView {
  text: string;
  code: string;
  signatures: string;
  lineAt: (offset: number) => number;
  offsetAtLine: (line: number) => number | undefined;
  touched: (start: number, end: number) => boolean;
}

/** Mask non-code without changing offsets. Incomplete strings stay masked to the hunk boundary. */
export function maskCode(text: string, pythonOrRuby = false, preserveDelimiters = false): string {
  const out = text.split('');
  let quote = '';
  let block = false;
  let line = false;
  let previous = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === '\n') { line = false; continue; }
    if (line) { out[i] = ' '; continue; }
    if (block) {
      out[i] = ' ';
      if (ch === '*' && next === '/') { out[++i] = ' '; block = false; }
      continue;
    }
    if (quote) {
      out[i] = ' ';
      if (ch === '\\') { if (i + 1 < text.length) out[++i] = ' '; }
      else if (text.startsWith(quote, i)) {
        for (let k = 0; k < quote.length; k++) out[i + k] = preserveDelimiters ? quote[k]! : ' ';
        i += quote.length - 1;
        quote = '';
      }
      continue;
    }
    if (ch === '/' && next === '*') { out[i] = out[++i] = ' '; block = true; }
    else if ((!pythonOrRuby && ch === '/' && next === '/') || (pythonOrRuby && ch === '#')) {
      out[i] = ' '; line = true;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = pythonOrRuby && text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
      out[i] = preserveDelimiters ? ch : ' ';
      for (let k = 1; k < quote.length; k++) out[i + k] = preserveDelimiters ? ch : ' ';
      i += quote.length - 1;
      previous = 'v';
    } else if (!pythonOrRuby && ch === '/' && /^(?:$|[(,=:[!&|?{};+*%~^<>-])$/.test(previous)) {
      let end = i + 1;
      let inClass = false;
      for (; end < text.length && text[end] !== '\n'; end++) {
        if (text[end] === '\\') end++;
        else if (text[end] === '[') inClass = true;
        else if (text[end] === ']') inClass = false;
        else if (text[end] === '/' && !inClass) break;
      }
      if (text[end] === '/') {
        for (let cursor = i; cursor <= end; cursor++) out[cursor] = ' ';
        i = end;
        previous = 'v';
      } else previous = ch;
    } else if (!/\s/.test(ch)) previous = ch;
  }
  return out.join('');
}

export function sourceView(chunk: Chunk, side: 'before' | 'after', pythonOrRuby = false): SourceView {
  const selected = chunk.changes.map((change, position) => ({ change, position }))
    .filter(({ change }) => change.type !== (side === 'after' ? 'del' : 'add'));
  const starts: number[] = [];
  let text = '';
  for (const { change } of selected) { starts.push(text.length); text += body(change.content) + '\n'; }
  const indexAt = (offset: number): number => {
    let lo = 0;
    let hi = starts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid]! <= offset) lo = mid; else hi = mid; }
    return lo;
  };
  return {
    text, code: maskCode(text, pythonOrRuby), signatures: maskCode(text, pythonOrRuby, true),
    offsetAtLine: line => {
      const index = selected.findIndex(({change}) => (change.type === 'normal' ? side === 'before' ? change.ln1 : change.ln2 : change.ln) === line);
      return index < 0 ? undefined : starts[index];
    },
    lineAt: offset => {
      const change = selected[indexAt(offset)]?.change;
      return change ? change.type === 'normal' ? side === 'before' ? change.ln1 : change.ln2 : change.ln : chunk.newStart;
    },
    touched: (start, end) => {
      const first = selected[indexAt(start)];
      const last = selected[indexAt(end)];
      return !!first && !!last && chunk.changes.slice(first.position, last.position + 1).some(c => c.type !== 'normal');
    },
  };
}

export function closingDelimiter(code: string, open: number, left = '{', right = '}'): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === left) depth++;
    else if (code[i] === right && --depth === 0) return i;
  }
  return -1;
}

export const compact = (text: string): string => text.replace(/\s+/g, '');

export interface Callable { name: string; header: string; start: number; open: number; end: number; body: string }
/** Complete braced function bodies visible in the hunk. Truncated scopes are left alone. */
export function callables(view: SourceView): Callable[] {
  const result: Callable[] = [];
  const header = /\b(?:function\s+|fn\s+|func\s+)([A-Za-z_$][\w$]*)\s*\([^{}]*\)[^{;]*\{/g;
  for (const match of view.code.matchAll(header)) {
    const start = match.index!;
    const open = start + match[0].length - 1;
    const end = closingDelimiter(view.code,open);
    if (end < 0) continue;
    result.push({name:match[1]!,header:compact(match[0]),start,open,end,body:view.code.slice(open + 1,end)});
  }
  return result;
}

/** Complete named JS/TS test callbacks; helper functions and nested callbacks are separate scopes. */
export function testBodies(view: SourceView): Array<{key:string;open:number;end:number;body:string}> {
  const result: Array<{key:string;open:number;end:number;body:string}> = [];
  for (const match of view.code.matchAll(/\b(?:it|test)(?:\.(?!each\b)\w+)*\s*\(/g)) {
    const openArgs = match.index! + match[0].length - 1;
    const endArgs = closingDelimiter(view.code,openArgs,'(',')');
    if (endArgs < 0) continue;
    const title = /^\s*(['"`])((?:\\.|[^\\])*?)\1/.exec(view.text.slice(openArgs + 1,endArgs));
    if (!title) continue;
    let depth = 0;
    let last = openArgs + 1;
    for (let i = openArgs + 1; i < endArgs; i++) {
      if ('({['.includes(view.code[i]!)) depth++;
      else if (')}]'.includes(view.code[i]!)) depth--;
      else if (view.code[i] === ',' && depth === 0) last = i + 1;
    }
    const callback = /^\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{|^\s*(?:async\s+)?function\s*\([^)]*\)\s*\{/.exec(view.code.slice(last,endArgs));
    if (!callback) continue;
    const open = last + callback[0].length - 1;
    const end = closingDelimiter(view.code,open);
    if (end >= 0) result.push({key:title[2]!,open,end,body:view.code.slice(open + 1,end)});
  }
  return result;
}
