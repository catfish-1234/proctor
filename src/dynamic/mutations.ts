import { parse, type Node } from 'acorn';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MUTATION_LIMIT = 4;
export interface Mutation { line: number; functionName: string; source: string; operation: string }
interface FunctionRange { start: number; end: number }
export interface Calls { js: Map<string, FunctionRange[]>; python: Map<string, number[]> }

/** A bounded line diff. Large files are outside this prototype, rather than approximated. */
export function changedSourceLines(before: string, after: string): Set<number> {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length * b.length > 4_000_000) return new Set();
  const width = b.length + 1, rows = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    rows[i * width + j] = a[i] === b[j] ? rows[(i + 1) * width + j + 1]! + 1 : Math.max(rows[(i + 1) * width + j]!, rows[i * width + j + 1]!);
  }
  const changed = new Set<number>();
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i === a.length || rows[i * width + j + 1]! >= rows[(i + 1) * width + j]!)) { changed.add(++j); }
    else i++;
  }
  return changed;
}

const PYTHON_PROFILE = `import atexit,json,os,sys,threading
root=os.getcwd()+os.sep
calls=set()
def record(frame,event,arg):
    if event=='call' and frame.f_code.co_filename.startswith(root):
        calls.add((frame.f_code.co_filename,frame.f_code.co_firstlineno))
def save():
    with open(os.path.join(os.environ['PROCTOR_CALLS'],'python-'+str(os.getpid())+'.json'),'w') as out:
        json.dump(sorted(calls),out)
sys.setprofile(record)
threading.setprofile(record)
atexit.register(save)
`;
export function coverageEnvironment(dir: string): { env: NodeJS.ProcessEnv; path: string } {
  const path = join(dir, '.proctor-calls'), hooks = join(path, 'hooks');
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, 'sitecustomize.py'), PYTHON_PROFILE);
  return { path, env: { NODE_V8_COVERAGE: path, PROCTOR_CALLS: path, PYTHONPATH: hooks } };
}
/** Missing or unreadable coverage is no evidence that a function ran. */
export function readCalls(path: string, dir: string): Calls {
  const calls: Calls = { js: new Map(), python: new Map() };
  for (const name of readdirSync(path).filter(p => p.endsWith('.json')).slice(0, 100)) {
    try {
      const text = readFileSync(join(path, name), 'utf8');
      if (text.length > 4 * 1024 * 1024) continue;
      const data = JSON.parse(text);
      if (name.startsWith('python-')) {
        for (const [file, line] of data) calls.python.set(file, [...calls.python.get(file) ?? [], line]);
      } else for (const script of data.result ?? []) {
        if (!script.url.startsWith('file:')) continue;
        const file = fileURLToPath(script.url);
        if (relative(dir, file).startsWith('..' + sep)) continue;
        const ranges = script.functions.map((fn: { ranges: { startOffset: number; endOffset: number; count: number }[] }) => fn.ranges[0])
          .filter((r: { count: number }) => r.count > 0).map((r: { startOffset: number; endOffset: number }) => ({ start: r.startOffset, end: r.endOffset }));
        calls.js.set(file, [...calls.js.get(file) ?? [], ...ranges]);
      }
    } catch { /* An incomplete coverage artifact cannot justify a mutation finding. */ }
  }
  return calls;
}

// Only parser nodes, not text patterns, define executable statements and their containing function.
type Ast = Node & { [key: string]: unknown };
const OMIT = Symbol('deleted statement');
function canonical(value: unknown, target?: Ast, replacement?: unknown): unknown {
  if (target && value === target) return canonical(replacement);
  if (Array.isArray(value)) return value.map(v => canonical(v, target, replacement)).filter(v => v !== OMIT);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'raw'].includes(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => [key, canonical(v, target, replacement)]));
}
const parseJs = (source: string) => parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) as unknown as Ast;
export function jsMutations(before: string, source: string, called: FunctionRange[]): Mutation[] {
  let ast: Ast, previous: Ast;
  try { ast = parseJs(source); previous = parseJs(before); } catch { return []; }
  const fingerprint = (node: Ast) => JSON.stringify(canonical(node));
  const original = new Set<string>();
  function remember(node: Ast): void {
    if (['ReturnStatement', 'ThrowStatement', 'ExpressionStatement', 'VariableDeclaration', 'IfStatement'].includes(node.type)) original.add(fingerprint(node));
    if (node.type === 'IfStatement') original.add(fingerprint(node.test as Ast));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) remember(child as Ast); }
      else if (value && typeof value === 'object' && 'type' in value) remember(value as Ast);
    }
  }
  remember(previous);
  const changed = changedSourceLines(before, source), candidates: Mutation[] = [];
  const used = new Set<number>();
  function visit(node: Ast, fn?: Ast): void {
    if (candidates.length >= MUTATION_LIMIT) return;
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) fn = node;
    const line = node.loc!.start.line;
    if (fn && changed.has(line) && !used.has(line) && !original.has(fingerprint(node)) && called.some(r => r.start === fn!.start && r.end === fn!.end)) {
      const start = source.lastIndexOf('\n', node.start - 1) + 1;
      const end = source.indexOf('\n', node.end);
      const lineEnd = end < 0 ? source.length : end;
      const fullLine = /^\s*$/.test(source.slice(start, node.start)) && /^\s*$/.test(source.slice(node.end, lineEnd));
      const attempts: { text: string; replacement: unknown; target: Ast; operation: string }[] = [];
      if (fullLine && node.loc!.end.line === line && ['ReturnStatement', 'ThrowStatement', 'ExpressionStatement', 'VariableDeclaration', 'IfStatement'].includes(node.type)) {
        attempts.push({ text: source.slice(0, node.start) + source.slice(node.end), replacement: OMIT, target: node, operation: 'delete statement' });
      }
      if (node.type === 'IfStatement') {
        const test = node.test as Ast;
        // A changed condition must fit on one source line; multiline rewrites are ambiguous.
        if (test.loc!.end.line === line && !original.has(fingerprint(test))) attempts.push({ text: source.slice(0, test.start) + `!(${source.slice(test.start, test.end)})` + source.slice(test.end),
          target: test, replacement: { type: 'UnaryExpression', operator: '!', prefix: true, argument: canonical(test) }, operation: 'negate condition' });
      }
      for (const attempt of attempts) {
        try {
          const parsed = parseJs(attempt.text);
          if (JSON.stringify(canonical(parsed)) !== JSON.stringify(canonical(ast, attempt.target, attempt.replacement))) continue;
          candidates.push({ line, functionName: (fn.id as { name?: string } | undefined)?.name ?? '<anonymous>', source: attempt.text, operation: attempt.operation });
          used.add(line); break;
        } catch { /* A parse failure or changed surrounding syntax makes this candidate unusable. */ }
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) visit(child as Ast, fn);
      } else if (value && typeof value === 'object' && 'type' in value) visit(value as Ast, fn);
    }
  }
  visit(ast);
  return candidates.slice(0, MUTATION_LIMIT);
}

const PYTHON_MUTATIONS = `import ast,copy,json,sys
data=json.load(sys.stdin)
source=data['source']
lines=source.splitlines(keepends=True)
tree=ast.parse(source)
original={ast.dump(n) for n in ast.walk(ast.parse(data['before'])) if isinstance(n,(ast.stmt,ast.expr))}
# Require a lossless syntax round trip before editing this file.
assert ast.dump(ast.parse(ast.unparse(tree)))==ast.dump(tree)
changed=set(data['changed'])
called=set(data['called'])
out=[]
used=set()
def offset(line,col):
    return sum(map(len,lines[:line-1]))+len(lines[line-1].encode('utf-8')[:col].decode('utf-8'))
class Replace(ast.NodeTransformer):
    def __init__(self,target,replacement): self.target,self.replacement=target,replacement
    def visit(self,node):
        if node is self.target: return self.replacement
        return super().visit(node)
def visit(node,fn=None):
    if len(out)>=4: return
    if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
        fn=node if not node.decorator_list and isinstance(node,ast.FunctionDef) else None
    line=getattr(node,'lineno',0)
    if fn and fn.lineno in called and line in changed and line not in used and ast.dump(node) not in original:
        attempts=[]
        if isinstance(node,(ast.Return,ast.Raise,ast.Assign,ast.AnnAssign,ast.AugAssign,ast.Expr,ast.If)):
            start=offset(line,node.col_offset)
            end=offset(node.end_lineno,node.end_col_offset)
            if node.end_lineno==line and not source[offset(line,0):start].strip() and not source[end:offset(line,len(lines[line-1].encode('utf-8')))].strip():
                attempts.append((source[:start]+source[end:],node,None,'delete statement'))
        target=node.test if isinstance(node,ast.If) else node.value if isinstance(node,ast.Return) else None
        if target is not None and target.lineno==target.end_lineno and ast.dump(target) not in original:
            start=offset(target.lineno,target.col_offset)
            end=offset(target.end_lineno,target.end_col_offset)
            replacement=ast.UnaryOp(op=ast.Not(),operand=copy.deepcopy(target))
            attempts.append((source[:start]+'not ('+source[start:end]+')'+source[end:],target,replacement,'negate condition' if isinstance(node,ast.If) else 'negate return'))
        for text,target,replacement,operation in attempts:
            try:
                parsed=ast.parse(text)
                memo={}
                expected=copy.deepcopy(tree,memo)
                expected=Replace(memo[id(target)],replacement).visit(expected)
                same=ast.dump(parsed)==ast.dump(expected) and ast.dump(ast.parse(ast.unparse(parsed)))==ast.dump(parsed)
            except (SyntaxError,ValueError): same=False
            if same:
                out.append(dict(line=line,functionName=fn.name,source=text,operation=operation))
                used.add(line)
                break
    for child in ast.iter_child_nodes(node): visit(child,fn)
visit(tree)
print(json.dumps(out[:4]))
`;
export function pythonMutations(before: string, source: string, called: number[], dir: string): Mutation[] {
  const r = spawnSync('python3', ['-c', PYTHON_MUTATIONS], { cwd: dir, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    input: JSON.stringify({ before, source, changed: [...changedSourceLines(before, source)], called }) });
  if (r.status !== 0) return [];
  try { return JSON.parse(r.stdout); } catch { return []; /* Unreadable parser output provides no safe candidates. */ }
}
