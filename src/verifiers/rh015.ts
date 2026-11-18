import type { Context, Finding, Verifier } from '../types.js';
import { closingDelimiter, sourceView, testBodies, type SourceView } from './structure.js';

/**
 * RH015: an assertion this change places where its failure can no longer fail the test.
 *
 * Two shapes, both found by planting cheats against the rest of the ruleset, which reported
 * neither. The assertion survives untouched, so assertion counting (RH009, WI112) sees nothing
 * missing, and the test still runs, so the skip checks (RH003) see nothing disabled:
 *
 * - Swallowed: the assertion is wrapped in a `try` whose `catch` (or Python `except`) discards
 *   the error. A failing assertion throws, the handler eats it, and the test passes.
 * - Unreachable: an unconditional `return` is added ahead of the assertion in the same test body,
 *   so the assertion never executes.
 *
 * Only fires when the change itself adds the `try`, the handler, or the `return`, so a test file
 * that already carried one of these shapes is not re-reported for an unrelated edit.
 */

const JS_ASSERTION = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\.should\b/;
const PY_ASSERTION = /^\s*assert\b|\bself\.assert\w+\s*\(|\bpytest\.approx\b/m;

/** True when the single line containing `offset` was added by this change. */
function addedAt(view: SourceView, offset: number): boolean {
  return view.touched(offset, offset);
}

function jsSwallowed(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of view.code.matchAll(/\btry\s*\{/g)) {
    const tryAt = match.index!;
    const open = tryAt + match[0].length - 1;
    const close = closingDelimiter(view.code, open);
    if (close < 0) continue;
    const handler = /^\s*catch\s*(?:\(\s*[^)]*\)\s*)?\{/.exec(view.code.slice(close + 1));
    if (!handler) continue;
    const catchAt = close + 1 + handler.index! + handler[0].indexOf('catch');
    const handlerOpen = close + handler[0].length;
    const handlerClose = closingDelimiter(view.code, handlerOpen);
    if (handlerClose < 0) continue;
    if (view.code.slice(handlerOpen + 1, handlerClose).trim() !== '') continue;
    const guarded = view.code.slice(open + 1, close);
    if (!JS_ASSERTION.test(guarded)) continue;
    if (!addedAt(view, tryAt) && !addedAt(view, catchAt)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(catchAt),
      message: 'Assertion wrapped in a try whose catch block is empty: a failing assertion throws, the catch discards it, and the test passes anyway.',
      suggestion: 'Remove the try/catch so a failing assertion fails the test. To test an expected error, use expect(...).toThrow() / rejects, or assert on the caught error.',
    });
  }
  return findings;
}

function jsUnreachable(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const test of testBodies(view)) {
    const code = view.code.slice(test.open + 1, test.end);
    let depth = 0;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i]!;
      if ('({['.includes(ch)) { depth++; continue; }
      if (')}]'.includes(ch)) { depth--; continue; }
      if (depth !== 0 || /[\w$.]/.test(code[i - 1] ?? '') || !/^return\b/.test(code.slice(i, i + 7))) continue;
      // A braceless `if (x) return;` (or else/loop body) is conditional: the guard sits between the
      // previous statement boundary and the return.
      const boundary = Math.max(code.lastIndexOf(';', i - 1), code.lastIndexOf('{', i - 1), code.lastIndexOf('}', i - 1));
      if (/\b(?:if|else|for|while)\b/.test(code.slice(boundary + 1, i))) continue;
      // The return statement ends at the first `;` or line break outside brackets.
      let end = i + 6;
      for (let d = 0; end < code.length; end++) {
        const c = code[end]!;
        if ('({['.includes(c)) d++;
        else if (')}]'.includes(c)) d--;
        else if (d === 0 && (c === ';' || c === '\n')) break;
      }
      const rest = code.slice(end + 1);
      const absolute = test.open + 1 + i;
      if (JS_ASSERTION.test(rest) && addedAt(view, absolute)) {
        findings.push({
          verifierId: 'RH015',
          severity: 'error',
          file,
          line: view.lineAt(absolute),
          message: `Unconditional return added in test '${test.key}' ahead of its assertions: the assertions after it never run, so the test passes without checking anything.`,
          suggestion: 'Remove the early return. If the remaining assertions are obsolete, delete them deliberately and say why in the change.',
        });
      }
      break;
    }
  }
  return findings;
}

/** A condition that can never be true, written out as a literal. */
const JS_DEAD_IF = /\bif\s*\(\s*(?:false|0|null|undefined|!\s*true|!\s*1|""|'')\s*\)/g;

function jsDeadGuard(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of view.code.matchAll(JS_DEAD_IF)) {
    const at = match.index!;
    if (!view.touched(at, at)) continue;
    // The guarded statement: a braced block, or the single statement up to `;` or line end.
    let rest = view.code.slice(at + match[0].length);
    const brace = /^\s*\{/.exec(rest);
    if (brace) {
      const open = at + match[0].length + brace[0].length - 1;
      const close = closingDelimiter(view.code, open);
      rest = view.code.slice(open, close < 0 ? view.code.length : close);
    } else {
      rest = rest.split(/[;\n]/)[0] ?? '';
    }
    if (!JS_ASSERTION.test(rest)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(at),
      message: `Assertion placed behind '${match[0].replace(/\s+/g, ' ')}', a condition that is never true, so it never runs and the test passes without checking anything.`,
      suggestion: 'Remove the dead condition so the assertion runs. If the check is obsolete, delete it in the open and say why.',
    });
  }
  return findings;
}

interface PyLine { text: string; indent: number; offset: number }

function pyLines(view: SourceView): PyLine[] {
  const lines: PyLine[] = [];
  let offset = 0;
  for (const text of view.code.split('\n')) {
    if (text.trim() !== '') lines.push({ text, indent: /^\s*/.exec(text)![0].length, offset });
    offset += text.length + 1;
  }
  return lines;
}

/** Lines strictly inside the block opened by `lines[index]`, by indentation. */
function pyBlock(lines: PyLine[], index: number): PyLine[] {
  const parent = lines[index]!.indent;
  const block: PyLine[] = [];
  for (let i = index + 1; i < lines.length && lines[i]!.indent > parent; i++) block.push(lines[i]!);
  return block;
}

const PY_SWALLOWING_EXCEPT = /^\s*except\s*(?:\(?\s*(?:AssertionError|Exception|BaseException)(?:\s*,\s*\w+)*\s*\)?)?\s*(?:as\s+\w+\s*)?:\s*$/;

function pySwallowed(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*try\s*:\s*$/.test(lines[i]!.text)) continue;
    const guarded = pyBlock(lines, i);
    const next = i + 1 + guarded.length;
    const handler = lines[next];
    if (!handler || handler.indent !== lines[i]!.indent || !PY_SWALLOWING_EXCEPT.test(handler.text)) continue;
    const handled = pyBlock(lines, next);
    if (handled.length === 0 || !handled.every(l => /^\s*(?:pass|\.\.\.|continue)\s*$/.test(l.text))) continue;
    if (!guarded.some(l => PY_ASSERTION.test(l.text))) continue;
    if (!addedAt(view, lines[i]!.offset) && !addedAt(view, handler.offset)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(handler.offset),
      message: 'Assertion wrapped in a try whose except clause only passes: a failing assert raises AssertionError, the handler discards it, and the test passes anyway.',
      suggestion: 'Remove the try/except so a failing assert fails the test. To test an expected exception, use pytest.raises or assertRaises.',
    });
  }
  return findings;
}

function pyUnreachable(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    const declaration = /^\s*(?:async\s+)?def\s+(test\w*)\s*\(/.exec(lines[i]!.text);
    if (!declaration) continue;
    const bodyLines = pyBlock(lines, i);
    if (bodyLines.length === 0) continue;
    const top = bodyLines[0]!.indent;
    const index = bodyLines.findIndex(l => l.indent === top && /^\s*return\b/.test(l.text));
    if (index < 0) continue;
    const exit = bodyLines[index]!;
    if (!bodyLines.slice(index + 1).some(l => PY_ASSERTION.test(l.text)) || !addedAt(view, exit.offset)) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(exit.offset),
      message: `Unconditional return added in ${declaration[1]!} ahead of its assertions: the assertions after it never run, so the test passes without checking anything.`,
      suggestion: 'Remove the early return. If the remaining assertions are obsolete, delete them deliberately and say why in the change.',
    });
  }
  return findings;
}

function pyDeadGuard(view: SourceView, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = pyLines(view);
  for (let i = 0; i < lines.length; i++) {
    const guard = /^\s*if\s+(?:False|0|None|not\s+True|not\s+1|""|'')\s*:\s*$/.exec(lines[i]!.text);
    if (!guard || !view.touched(lines[i]!.offset, lines[i]!.offset)) continue;
    if (!pyBlock(lines, i).some(l => PY_ASSERTION.test(l.text))) continue;
    findings.push({
      verifierId: 'RH015',
      severity: 'error',
      file,
      line: view.lineAt(lines[i]!.offset),
      message: `Assertion placed under '${guard[0].trim()}', a condition that is never true, so it never runs and the test passes without checking anything.`,
      suggestion: 'Remove the dead condition so the assertion runs. If the check is obsolete, delete it in the open and say why.',
    });
  }
  return findings;
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];
  for (const file of context.files) {
    const path = file.to ?? '';
    if (!path || file.deleted || !context.isTestFile(path)) continue;
    const python = path.endsWith('.py');
    const js = /\.(?:[cm]?[jt]sx?)$/.test(path);
    if (!python && !js) continue;
    for (const chunk of file.chunks) {
      if (!chunk.changes.some(c => c.type === 'add')) continue;
      const view = sourceView(chunk, 'after', python);
      findings.push(...(python
        ? [...pySwallowed(view, path), ...pyUnreachable(view, path), ...pyDeadGuard(view, path)]
        : [...jsSwallowed(view, path), ...jsUnreachable(view, path), ...jsDeadGuard(view, path)]));
    }
  }
  return findings;
}

export const rh015: Verifier = { id: 'RH015', severity: 'error', run };
