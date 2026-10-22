import { parse } from 'acorn';
import { posix } from 'node:path';
import { parseBehaviorJs, parseBehaviorPython, type Value, type Callable, type ParsedBehavior } from './behavior-parse.js';
import { behaviorUnits, sweepInputs, type BehaviorUnit, type Outcome, type Sweep } from './behavior.js';
import type { Snapshot } from './snapshots.js';

export const DOCUMENT_UNIT_LIMIT = 2;
export const DOCUMENT_INPUT_LIMIT = 12;
export interface DocumentRule {
  file: string; line: number; quote: string; name: string; module?: string; arity: number;
  kind: 'example' | 'ascending' | 'descending' | 'unique' | 'width' | 'sign' | 'trunc' | 'floor' | 'pad';
  confidence: 'precise' | 'advisory'; args?: Value[]; expected?: Value;
}
// Parse literal data, never execute documentation or turn prose into code.
type Ast = any;
function data(node: Ast, depth = 0): Value {
  if (depth > 2) throw Error('nested literal');
  if (node.type === 'Literal' && (node.value === null || typeof node.value === 'boolean' || typeof node.value === 'string' && node.value.length <= 256 ||
    typeof node.value === 'number' && Number.isFinite(node.value) && Math.abs(node.value) <= Number.MAX_SAFE_INTEGER)) return node.value;
  if (node.type === 'Identifier' && ['True', 'False', 'None'].includes(node.name)) return node.name === 'None' ? null : node.name === 'True';
  if (node.type === 'UnaryExpression' && node.operator === '-' && typeof node.argument.value === 'number') {
    const value = data(node.argument, depth); if (typeof value === 'number') return -value;
  }
  if (node.type === 'ArrayExpression' && node.elements.length <= 12) return node.elements.map((n: Ast) => data(n, depth + 1));
  throw Error('not literal data');
}
export function documentValue(text: string): Value | undefined {
  try {
    const ast = parse(`(${text})`, { ecmaVersion: 'latest' }) as Ast;
    if (ast.body.length !== 1) return undefined;
    return data(ast.body[0].expression);
  } catch { return undefined; /* Expressions, objects and unsupported literals are not contracts. */ }
}
function signature(text: string): { name: string; module?: string; arity: number; args?: Value[]; params?: string[] } | undefined {
  try {
    const ast = parse(`(${text})`, { ecmaVersion: 'latest' }) as Ast;
    const call = ast.body.length === 1 ? ast.body[0].expression : undefined;
    if (call?.type !== 'CallExpression' || !call.arguments.length || call.arguments.length > 3 || call.optional) return undefined;
    const c = call.callee;
    const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' ? c.property.name : undefined;
    if (!name) return undefined;
    let args: Value[] | undefined;
    try { args = call.arguments.map((a: Ast) => data(a)); } catch { /* A signature with identifiers describes a domain instead of a point example. */ }
    const params = call.arguments.every((a: Ast) => a.type === 'Identifier') ? call.arguments.map((a: Ast) => a.name) : undefined;
    return { name, module: c.type === 'MemberExpression' ? c.object.name : undefined, arity: call.arguments.length, args, params };
  } catch { return undefined; /* Unreadable call syntax is not a binding. */ }
}
export const isDocumentation = (file: string) => /^(?:SPEC[^/]*|README[^/]*)\.(?:md|rst|txt)$/i.test(file) ||
  /^docs\/[^\n]+\.(?:md|rst|txt)$/i.test(file) && !file.split('/').some(p => ['bench', 'node_modules', 'vendor', 'dist', '.git'].includes(p));

export function extractDocumentation(file: string, source: string): DocumentRule[] {
  const rules: DocumentRule[] = [], headings = [{ level: 0, excluded: false, uncertain: false }];
  const contexts = new Map<DocumentRule, typeof headings>();
  const uncertain = (text: string) => {
    if (/\b(?:only|except|unless|conditional|deprecated|incorrect|invalid|historical|legacy|old|previous|wrong|obsolete|counterexample|hypothetical|proposed|future|draft|not|never|bad|domain|range|precondition|assumption|requires?|accepts?|nonnegative|positive|ASCII|bytes?|inputs?|arguments?|parameters?|strings?|lists?|integers?|numbers?|values?|characters?|uppercase|lowercase|empty|nonempty|length|width)\b/i.test(text)) headings.at(-1)!.uncertain = true;
  };
  let fence = false, htmlComment = false;
  for (const [index, raw] of source.split('\n').slice(0, 2000).entries()) {
    const text = raw.trim();
    if (text.includes('<!--')) htmlComment = true;
    if (htmlComment) { if (text.includes('-->')) htmlComment = false; continue; }
    if (/^(?:```|~~~)/.test(text)) { fence = !fence; continue; }
    // Code fences can contain deprecated snippets and arbitrary setup. Only prose is normative here.
    if (fence || text.startsWith('>')) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(text);
    if (heading) {
      while (headings.length && headings.at(-1)!.level >= heading[1]!.length) headings.pop();
      headings.push({ level: heading[1]!.length, excluded: /\b(?:legacy|old|previous|deprecated|historical|migration|draft|proposed|incorrect|counterexample|changelog|todo)\b/i.test(heading[2]!), uncertain: false });
      uncertain(heading[2]!);
      continue;
    }
    if (headings.some(h => h.excluded)) continue;
    const line = text.replace(/^[-*]\s+/, '').replace(/\.$/, '');
    const arrow = /^`([^`]+)`\s*(?:->|=>)\s*`([^`]+)`$/.exec(line) ?? /^`(.+?)\s+(?:->|=>)\s+(.+)`$/.exec(line);
    if (arrow) {
      const call = signature(arrow[1]!), expected = documentValue(arrow[2]!);
      if (call?.args && expected !== undefined) {
        const rule: DocumentRule = { file, line: index + 1, quote: text, name: call.name, module: call.module, arity: call.arity, confidence: 'precise', kind: 'example', args: call.args, expected };
        rules.push(rule); contexts.set(rule, [...headings]);
      }
      if (rules.length >= 32) break;
      continue;
    }
    const match = /^`([^`]+)` (.+)$/.exec(line);
    if (!match) { uncertain(text); continue; }
    const call = signature(match[1]!);
    if (!call) { uncertain(text); continue; }
    const count = rules.length;
    const base = { file, line: index + 1, quote: text, name: call.name, module: call.module, arity: call.arity, confidence: 'precise' as const };
    const tail = match[2]!;
    const returns = /^(?:must return|returns) `([^`]+)`$/.exec(tail);
    if (call.args && returns) {
      const expected = documentValue(returns[1]!);
      if (expected !== undefined) rules.push({ ...base, kind: 'example', args: call.args, expected });
    }
    if (!call.params || new Set(call.params).size !== call.params.length) {
      if (rules.length === count) uncertain(text);
      for (const rule of rules.slice(count)) contexts.set(rule, [...headings]);
      if (rules.length >= 32) break;
      continue;
    }
    const empty = /^(?:must return|returns) `([^`]+)` for an empty (list|string)$/.exec(tail);
    if (call.arity === 1 && empty) {
      const expected = documentValue(empty[1]!);
      if (expected !== undefined) rules.push({ ...base, kind: 'example', args: [empty[2] === 'list' ? [] : ''], expected });
    }
    const kinds: Record<string, DocumentRule['kind']> = {
      'must return all input integers in ascending order, preserving duplicates': 'ascending',
      'must return all input integers in descending order, preserving duplicates': 'descending',
      'must return the input integers without duplicates, preserving their original order': 'unique',
      'must preserve the number of Unicode code points for every string input': 'width',
      'must preserve the sign of every nonzero integer input': 'sign',
      'must round every finite number toward zero': 'trunc',
      'must round every finite number down toward negative infinity': 'floor',
    };
    if (call.arity === 1 && kinds[tail]) rules.push({ ...base, kind: kinds[tail]! });
    if (call.arity === 1 && tail === 'returns sorted values') rules.push({ ...base, kind: 'ascending', confidence: 'advisory' });
    const pad = /^must return exactly ([A-Za-z_][A-Za-z_0-9]*) Unicode code points when ([A-Za-z_][A-Za-z_0-9]*) is at least the input length$/.exec(tail.replaceAll('`', ''));
    if (call.arity === 2 && pad && pad[1] === pad[2] && pad[1] === call.params[1]) rules.push({ ...base, kind: 'pad' });
    if (rules.length === count) uncertain(text);
    for (const rule of rules.slice(count)) contexts.set(rule, [...headings]);
    if (rules.length >= 32) break;
  }
  return rules.map(rule => contexts.get(rule)?.some(c => c.uncertain) ? { ...rule, confidence: 'advisory' } : rule);
}

export function documentationRules(old: Snapshot, next: Snapshot): DocumentRule[] {
  return [...old].filter(([file, entry]) => isDocumentation(file) && entry.data.length <= 64 * 1024 && entry.mode === next.get(file)?.mode && entry.data.equals(next.get(file)?.data ?? Buffer.alloc(0)))
    .slice(0, 20).flatMap(([file, entry]) => extractDocumentation(file, entry.data.toString())).slice(0, 32);
}
export function documentSeeds(rule: DocumentRule): Value[][] {
  if (rule.args) return [rule.args];
  if (['ascending', 'descending', 'unique'].includes(rule.kind)) return [[[]], [[2, 10, -1, 2]], [[3, 1]], [[1]]];
  if (rule.kind === 'width') return [['abc'], [''], ['😀'], ['abcdefgh']];
  if (rule.kind === 'sign') return [[-2], [2], [-1], [1]];
  if (rule.kind === 'trunc' || rule.kind === 'floor') return [[1.8], [-1.8], [0.2], [-0.2], [2], [-2]];
  return [['a', 3], ['😀', 3], ['', 0], ['ab', 4]];
}
function reference(rule: DocumentRule, args: Value[]): unknown | undefined {
  const x = args[0];
  if (rule.kind === 'example') return JSON.stringify(args) === JSON.stringify(rule.args) ? rule.expected : undefined;
  if (['ascending', 'descending', 'unique'].includes(rule.kind)) {
    if (!Array.isArray(x) || !x.every(v => typeof v === 'number' && Number.isSafeInteger(v))) return undefined;
    if (rule.kind === 'unique') return [...new Set(x)];
    return [...x as number[]].sort((a, b) => rule.kind === 'ascending' ? a - b : b - a);
  }
  if (rule.kind === 'trunc' || rule.kind === 'floor') return typeof x === 'number' && Number.isFinite(x) ? (rule.kind === 'trunc' ? Math.trunc(x) : Math.floor(x)) : undefined;
  return undefined;
}
/** Undefined means the input or observed result is outside this statement's supported domain. */
export function satisfiesDocumentation(rule: DocumentRule, args: Value[], outcome: Outcome): boolean | undefined {
  if (args.length !== rule.arity || outcome.unsupported) return undefined;
  const value = outcome.value, x = args[0];
  const exact = reference(rule, args);
  if (exact !== undefined) return !outcome.error && JSON.stringify(exact) === JSON.stringify(value);
  if (rule.kind === 'width' && typeof x === 'string') return !outcome.error && typeof value === 'string' && [...value].length === [...x].length;
  if (rule.kind === 'sign' && typeof x === 'number' && Number.isSafeInteger(x) && x !== 0) return !outcome.error && typeof value === 'number' && Number.isFinite(value) && Math.sign(value) === Math.sign(x);
  if (rule.kind === 'pad' && typeof x === 'string' && typeof args[1] === 'number' && Number.isSafeInteger(args[1]) && args[1] >= [...x].length && args[1] <= 32) return !outcome.error && typeof value === 'string' && [...value].length === args[1];
  return undefined;
}

/** Do not execute neighbors that have no oracle or lie outside every documented domain. */
export function documentationInputs(rules: DocumentRule[], fixtures: Value[][], claims: Value[][] = []): Value[][] {
  return sweepInputs([...claims, ...rules.flatMap(documentSeeds), ...fixtures])
    .filter(args => rules.some(rule => satisfiesDocumentation(rule, args, {}) !== undefined)).slice(0, DOCUMENT_INPUT_LIMIT);
}

export interface DocumentInventory { files: ParsedBehavior[]; complete: boolean; sourceFiles: string[] }
export function documentInventory(tree: Snapshot, isTest: (file: string) => boolean, dir: string): DocumentInventory {
  const code = [...tree].filter(([file]) => !isTest(file) && /\.(?:js|mjs|cjs|py|ts|tsx|jsx|mts|cts|go|rs|java|rb|php|cs|kt|cpp|c|swift)$/.test(file) && !file.split('/').some(p => ['bench', 'node_modules', 'vendor', 'dist', '.git'].includes(p)));
  const all = code.filter(([file]) => /\.(?:js|mjs|cjs|py)$/.test(file));
  const selected = all.filter(([, e]) => e.data.length < 128 * 1024).slice(0, 120);
  const files = [...selected.filter(([f]) => !f.endsWith('.py')).flatMap(([f, e]) => parseBehaviorJs(f, e.data.toString()) ?? []),
    ...parseBehaviorPython(selected.filter(([f]) => f.endsWith('.py')).map(([f, e]) => [f, e.data.toString()]), dir)];
  return { files, complete: files.length === code.length, sourceFiles: code.map(([f]) => f) };
}
export function bindsDocumentation(rule: DocumentRule, file: string, fn: Callable, inventory: DocumentInventory): boolean {
  if (rule.name !== fn.exported || rule.arity !== fn.params.length) return false;
  if (rule.module) {
    const matches = inventory.sourceFiles.filter(f => posix.basename(f, posix.extname(f)) === rule.module);
    return matches.length === 1 && matches[0] === file;
  }
  const matches = inventory.files.filter(p => p.identifiers?.includes(rule.name)).map(p => p.file);
  return inventory.complete && matches.length === 1 && matches[0] === file;
}

export function documentedUnits(old: Snapshot, next: Snapshot, isTest: (file: string) => boolean, dir: string, rules: DocumentRule[]): { unit: BehaviorUnit; rules: DocumentRule[] }[] {
  const inventory = documentInventory(next, isTest, dir);
  const matching = (file: string, fn: Callable) => rules.filter(r => bindsDocumentation(r, file, fn, inventory));
  return behaviorUnits(old, next, isTest, dir, (file, fn) => matching(file, fn).flatMap(documentSeeds), (file, fn) => matching(file, fn).length > 0)
    .slice(0, DOCUMENT_UNIT_LIMIT).map(unit => {
      const fn = { name: unit.name, exported: unit.name, params: unit.params!, source: '', line: unit.line };
      const bound = matching(unit.file, fn);
      return { unit: { ...unit, inputs: documentationInputs(bound, unit.fixtures) }, rules: bound };
    });
}

export function conflictingDocumentation(rules: DocumentRule[], inputs: Value[][]): boolean {
  const precise = rules.filter(r => r.confidence === 'precise');
  if (new Set(precise.filter(r => r.kind !== 'example').map(r => r.kind)).size > 1) return true;
  for (const args of inputs) for (const rule of precise) {
    const value = reference(rule, args);
    if (value !== undefined && precise.some(other => satisfiesDocumentation(other, args, { value }) === false)) return true;
  }
  return false;
}

export interface DocumentClaim { args: Value[]; expected: Value; file: string; line: number; test: string }
export interface DocumentEvidence { rule: DocumentRule; index: number; blocking: boolean; claim?: DocumentClaim }
export function classifyDocumentation(unit: BehaviorUnit, rules: DocumentRule[], runs: Sweep[], claims: DocumentClaim[], changedDocs: boolean): DocumentEvidence[] {
  if (runs.length !== 4 || JSON.stringify(runs[0]!.outcomes) !== JSON.stringify(runs[1]!.outcomes) || JSON.stringify(runs[2]!.outcomes) !== JSON.stringify(runs[3]!.outcomes)) return [];
  const conflict = conflictingDocumentation(rules, unit.inputs), findings: DocumentEvidence[] = [];
  for (const rule of rules) {
    const claim = rule.kind !== 'example' ? claims.find(c => satisfiesDocumentation(rule, c.args, { value: c.expected }) === true &&
      unit.inputs.some((args, i) => JSON.stringify(args) === JSON.stringify(c.args) && JSON.stringify(runs[2]!.outcomes[i]!.value) === JSON.stringify(c.expected) && !runs[2]!.outcomes[i]!.error)) : undefined;
    const index = unit.inputs.findIndex((args, i) => satisfiesDocumentation(rule, args, runs[2]!.outcomes[i]!) === false &&
      (satisfiesDocumentation(rule, args, runs[0]!.outcomes[i]!) === true || claim));
    if (index >= 0) findings.push({ rule, index, claim, blocking: rule.confidence === 'precise' && !conflict && !changedDocs });
  }
  return findings;
}
