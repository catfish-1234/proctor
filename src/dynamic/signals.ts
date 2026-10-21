import type { Snapshot } from './snapshots.js';

const LITERAL = String.raw`(?:-?\d+(?:\.\d+)?|true|false|None|True|False|null|"[^"\n]*"|'[^'\n]*')`;
const ASSERTION_PATTERNS = [
  new RegExp(String.raw`^\s*((?:assert\.(?:strictEqual|equal|deepEqual|deepStrictEqual)|self\.assertEqual)\(.+?,\s*)(${LITERAL})(\s*\)\s*;?\s*)$`),
  new RegExp(String.raw`^\s*(expect\(.+?\)\.to(?:Be|Equal|StrictEqual)\(\s*)(${LITERAL})(\s*\)\s*;?\s*)$`),
  new RegExp(String.raw`^(\s*assert\s+.+?\s*==\s*)(${LITERAL})(\s*)$`),
];
const assertion = (line: string) => ASSERTION_PATTERNS.map(pattern => pattern.exec(line)).find(Boolean);
/** Only literal equality edits with exactly the same actual expression count as intent evidence. */
export function expectationChanges(before: string, after: string): { before: string; after: string }[] {
  const assertions = (text: string) => {
    const map = new Map<string, string>();
    for (const line of text.split('\n')) {
      const match = assertion(line);
      if (match) map.set(match[1]!.trim() + match[3]!.trim(), match[2]!);
    }
    return map;
  };
  const a = assertions(before), b = assertions(after);
  return [...a].filter(([key, value]) => b.has(key) && b.get(key) !== value).map(([key, value]) => ({ before: value, after: b.get(key)! }));
}
export function expectedEdits(before: string, after: string): boolean {
  return expectationChanges(before, after).length > 0;
}
export function expectationOnlyEdit(before: string, after: string): boolean {
  const canonical = (text: string) => text.split('\n').map(line => {
    const match = assertion(line);
    return match ? `${match[1]}__EXPECTED_LITERAL__${match[3]}` : line;
  }).join('\n');
  return expectedEdits(before, after) && canonical(before) === canonical(after);
}
export function documentedIntent(old: Snapshot, next: Snapshot): boolean {
  for (const [path, file] of next) {
    if (!/(?:^|\/)(?:SPEC[^/]*|CHANGELOG[^/]*)\.(?:md|rst|txt)$/i.test(path)) continue;
    const before = old.get(path)?.data.toString() ?? '';
    const previous = new Set(before.split('\n'));
    if (file.data.toString().split('\n').some(line => line.trim() && !/^\s*#/.test(line) && !previous.has(line))) return true;
  }
  return false;
}
/** Identifier comparison stays string equality; names are parsed with literal patterns, never interpolated. */
function definesPythonFunction(text: string, name: string): boolean {
  for (const match of text.matchAll(/^\s*def (\w+)\s*\(/gm)) {
    if (match[1] === name) return true;
  }
  return false;
}
export function locateTest(id: string, tree: Snapshot, tests: string[]): string | undefined {
  if (tests.includes(id) && tree.has(id)) return id;
  const [plainFile, plainFunction] = id.split('::');
  if (plainFunction && plainFile && tests.includes(plainFile) && tree.has(plainFile)) return plainFile;
  const python = (/^(test\w+) \(/.exec(id)?.[1] ?? id.split('::').at(-1))?.replace(/\[.*$/, '');
  const exact = tests.filter(p => {
    const text = tree.get(p)?.data.toString() ?? '';
    return text.includes(`'${id}'`) || text.includes(`"${id}"`) || (p.endsWith('.py') && !!python && definesPythonFunction(text, python));
  });
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const nested = tests.filter(p => [...(tree.get(p)?.data.toString() ?? '').matchAll(/\b(?:test|it)\s*\(\s*(['"])([^'"\n]+)\1/g)]
    .some(m => id.endsWith(' ' + m[2])));
  return nested.length === 1 ? nested[0] : undefined;
}
export type ProbeValue = number | string | boolean;
export interface Probe { file: string; name: string; input: ProbeValue; returned: ProbeValue; line: number; language: 'js' | 'python' }
const UNARY_ARITHMETIC = /^(\w+)\s*[*+\/-]\s*-?\d+(?:\.\d+)?$/;
const PY_BRANCH = /if\s+(\w+)\s*==\s*(-?\d+(?:\.\d+)?|True|False|"[^"\\\n]*"|'[^'\\\n]*')\s*:\s*return\s+(-?\d+(?:\.\d+)?|True|False|"[^"\\\n]*"|'[^'\\\n]*')/;
const JS_BRANCH = /if\s*\(\s*(\w+)\s*===?\s*(-?\d+(?:\.\d+)?|true|false|"[^"\\\n]*"|'[^'\\\n]*')\s*\)\s*(?:\{\s*)?return\s+(-?\d+(?:\.\d+)?|true|false|"[^"\\\n]*"|'[^'\\\n]*');?\s*\}?/;
function simpleReference(expression: string, arg: string, py: boolean): boolean {
  if (expression === arg) return true;
  const numeric = UNARY_ARITHMETIC.exec(expression);
  const method = /^(\w+)\.(\w+)\(\)$/.exec(expression);
  const negate = /^(?:!\s*|not\s+)(\w+)$/.exec(expression);
  const concat = /^(?:(\w+)\s*\+\s*(?:"[^"\\\n]*"|'[^'\\\n]*')|(?:"[^"\\\n]*"|'[^'\\\n]*')\s*\+\s*(\w+))$/.exec(expression);
  return numeric?.[1] === arg || negate?.[1] === arg || concat?.[1] === arg || concat?.[2] === arg ||
    (method?.[1] === arg && (py ? ['lower', 'upper', 'strip'] : ['toLowerCase', 'toUpperCase', 'trim']).includes(method[2]!));
}
function probeLiteral(text: string): ProbeValue {
  if (text.startsWith('"') || text.startsWith("'")) return text.slice(1, -1);
  if (/^(?:true|True|false|False)$/.test(text)) return text === 'true' || text === 'True';
  return Number(text);
}
export function probeInputs(input: ProbeValue): ProbeValue[] {
  if (typeof input === 'boolean') return [!input, input];
  if (typeof input === 'string') return [`${input}a`, input, `b${input}`];
  return [input - 1, input, input + 1];
}
/** Body of a simple Python def, parsed line by line so no name ever enters a pattern. */
function pythonBody(text: string, name: string, arg: string): string | undefined {
  const header = `def ${name}(${arg}):`;
  const start = text.indexOf(header);
  if (start < 0 || (start > 0 && text[start - 1] !== '\n')) return undefined;
  const lines = text.slice(start + header.length).split('\n');
  const body: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') { body.push(line); continue; }
    if (/^[ \t]/.test(line)) { body.push(line); continue; }
    break;
  }
  return body.length ? body.join('\n') : undefined;
}
/** Body of a simple JS function, located by string search and balanced to the first closing brace at column 0. */
function jsBody(text: string, name: string, arg: string): string | undefined {
  for (const marker of [`export function ${name}(${arg})`, `function ${name}(${arg})`]) {
    const start = text.indexOf(marker);
    if (start < 0) continue;
    const open = text.indexOf('{', start + marker.length);
    if (open < 0) return undefined;
    const close = text.indexOf('\n}', open);
    if (close < 0) return undefined;
    return text.slice(open + 1, close);
  }
  return undefined;
}
/** Named unary references only: arithmetic, string operations, identity and boolean negation. */
export function findProbes(old: Snapshot, next: Snapshot, isTest: (path: string) => boolean): Probe[] {
  const probes: Probe[] = [];
  for (const [file, entry] of next) {
    if (isTest(file) || !/\.(?:js|mjs|cjs|py)$/.test(file)) continue;
    const before = old.get(file)?.data.toString(), after = entry.data.toString();
    if (!before || before === after) continue;
    const py = file.endsWith('.py');
    const functions = py
      ? [...before.matchAll(/^def (\w+)\((\w+)\):\n[ \t]+return ([^\n]+)\n?/gm)]
      : [...before.matchAll(/(?:export\s+)?function (\w+)\((\w+)\)\s*\{\s*return\s+([^;{}\n]+);?\s*\}/g)];
    for (const fn of functions) {
      const [, name, arg, expression] = fn;
      if (!simpleReference(expression!.trim(), arg!, py)) continue;
      if (!py && !before.includes(`export function ${name}`) && !before.includes('module.exports') && !before.includes(`exports.${name}`)) continue;
      const body = py ? pythonBody(after, name!, arg!) : jsBody(after, name!, arg!);
      if (!body) continue;
      const branchMatch = (py ? PY_BRANCH : JS_BRANCH).exec(body);
      const branch = branchMatch && branchMatch[1] === arg ? branchMatch : undefined;
      if (!branch || !body.includes(expression!.trim())) continue;
      // No extra statements, calls, assignments or comments: no claim about arbitrary functions.
      const remainder = body.replace(branch[0], '').replace(/return\s+/, '').replace(/[;\s]/g, '');
      if (remainder !== expression!.replace(/\s/g, '')) continue;
      probes.push({ file, name: name!, input: probeLiteral(branch[2]!), returned: probeLiteral(branch[3]!), line: after.slice(0, after.indexOf(branch[0])).split('\n').length, language: py ? 'python' : 'js' });
    }
  }
  return probes.slice(0, 8);
}
