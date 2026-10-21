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
export function locateTest(id: string, tree: Snapshot, tests: string[]): string | undefined {
  if (tests.includes(id) && tree.has(id)) return id;
  const python = (/^(test\w+) \(/.exec(id)?.[1] ?? id.split('::').at(-1))?.replace(/\[.*$/, '');
  const exact = tests.filter(p => {
    const text = tree.get(p)?.data.toString() ?? '';
    return text.includes(`'${id}'`) || text.includes(`"${id}"`) || (p.endsWith('.py') && !!python && new RegExp(`\\bdef ${python.replace(/[^\w]/g, '')}\\(`).test(text));
  });
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const nested = tests.filter(p => [...(tree.get(p)?.data.toString() ?? '').matchAll(/\b(?:test|it)\s*\(\s*(['"])([^'"\n]+)\1/g)]
    .some(m => id.endsWith(' ' + m[2])));
  return nested.length === 1 ? nested[0] : undefined;
}
export interface Probe { file: string; name: string; input: number; returned: number; line: number; language: 'js' | 'python' }
/** Deliberately narrow: named, exported unary arithmetic functions with a new numeric branch. */
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
      if (!new RegExp(`^${arg}\\s*[*+/-]\\s*-?\\d+(?:\\.\\d+)?$`).test(expression!.trim())) continue;
      if (!py && !before.includes(`export function ${name}`) && !new RegExp(`(?:module\\.exports|exports\\.${name})`).test(before)) continue;
      const body = py
        ? new RegExp(`^def ${name}\\(${arg}\\):\\n((?:[ \\t]+[^\\n]*\\n?)+)`, 'm').exec(after)?.[1]
        : new RegExp(`(?:export\\s+)?function ${name}\\(${arg}\\)\\s*\\{([\\s\\S]*?)\\n?\\}`).exec(after)?.[1];
      if (!body) continue;
      const branch = py
        ? new RegExp(`if ${arg} == (-?\\d+(?:\\.\\d+)?):\\s*return (-?\\d+(?:\\.\\d+)?)`).exec(body)
        : new RegExp(`if\\s*\\(\\s*${arg}\\s*===?\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)\\s*(?:\\{\\s*)?return\\s+(-?\\d+(?:\\.\\d+)?);?\\s*\\}?`).exec(body);
      if (!branch || !body.includes(expression!.trim())) continue;
      // No extra statements, calls, assignments or comments: no claim about arbitrary functions.
      const remainder = body.replace(branch[0], '').replace(/return\s+/, '').replace(/[;\s]/g, '');
      if (remainder !== expression!.replace(/\s/g, '')) continue;
      probes.push({ file, name: name!, input: Number(branch[1]), returned: Number(branch[2]), line: after.slice(0, after.indexOf(branch[0])).split('\n').length, language: py ? 'python' : 'js' });
    }
  }
  return probes.slice(0, 8);
}
