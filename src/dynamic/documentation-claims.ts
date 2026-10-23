import { parse } from 'acorn';
import { spawnSync } from 'node:child_process';
import { parseBehaviorJs, type Call, type ParsedBehavior, type Value } from './behavior-parse.js';
import { importedUnit, type BehaviorUnit } from './behavior.js';
import { documentValue, type DocumentClaim } from './documentation.js';
import { locateTest } from './signals.js';
import type { Snapshot } from './snapshots.js';
import type { TestRun } from './runner.js';

interface Assertion { call: Call; expected: Value; line: number; test: string }
interface ClaimFile { parsed: ParsedBehavior; assertions: Assertion[] }
type Ast = any;
function jsClaims(file: string, source: string): ClaimFile | undefined {
  const parsed = parseBehaviorJs(file, source);
  if (!parsed) return undefined;
  const assertions: Assertion[] = [];
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) as Ast;
  const importedNames = new Set(parsed.imports.map(i => i.local)), declarations = new Map<string, number>();
  let reassigned = false;
  function bindings(node: Ast): void {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && importedNames.has(node.id.name)) declarations.set(node.id.name, (declarations.get(node.id.name) ?? 0) + 1);
    if (['AssignmentExpression', 'UpdateExpression'].includes(node.type)) {
      const n = node.left ?? node.argument;
      if (n?.type === 'Identifier' && importedNames.has(n.name) || n?.type === 'MemberExpression' && n.object.type === 'Identifier' && importedNames.has(n.object.name)) reassigned = true;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) bindings(child); }
      else if (value && typeof value === 'object' && 'type' in value) bindings(value);
    }
  }
  bindings(ast);
  if (reassigned || [...declarations.values()].some(n => n > 1)) return { parsed, assertions };
  const literal = (n: Ast) => documentValue(source.slice(n.start, n.end));
  const imported = (name: string, modules: string[], members: string[]) => parsed.imports.some(i => i.local === name && modules.includes(i.module) && (!i.member || i.member === 'default' || members.includes(i.member)));
  const methods = ['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual'];
  const assertModules = ['node:assert', 'node:assert/strict', 'assert', 'assert/strict'];
  for (const statement of ast.body) {
    const test = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
    if (test?.type !== 'CallExpression' || test.arguments.length !== 2 || typeof test.arguments[0]?.value !== 'string') continue;
    const callee = test.callee;
    const isTest = callee.type === 'Identifier' ? imported(callee.name, ['node:test', 'vitest', '@jest/globals'], ['test', 'it']) :
      callee.type === 'MemberExpression' && !callee.computed && ['test', 'it'].includes(callee.property.name) && callee.object.type === 'Identifier' && parsed.imports.some(i => i.local === callee.object.name && i.module === 'node:test' && !i.member);
    const fn = test.arguments[1];
    if (!isTest || !['FunctionExpression', 'ArrowFunctionExpression'].includes(fn.type) || fn.body.type !== 'BlockStatement' ||
      fn.body.body.some((s: Ast) => !['ExpressionStatement', 'VariableDeclaration'].includes(s.type))) continue;
    // Claims must be unconditional in a named passing test, with unshadowed imported bindings.
    const locals = [...fn.params.filter((p: Ast) => p.type === 'Identifier').map((p: Ast) => p.name),
      ...fn.body.body.filter((s: Ast) => s.type === 'VariableDeclaration').flatMap((s: Ast) => s.declarations.map((d: Ast) => d.id.type === 'Identifier' ? d.id.name : '<destructured>'))];
    if (locals.includes('<destructured>') || parsed.imports.some(i => locals.includes(i.local))) continue;
    for (const s of fn.body.body) {
      const assertion = s.type === 'ExpressionStatement' ? s.expression : undefined;
      if (assertion?.type !== 'CallExpression' || assertion.arguments.length !== 2) continue;
      const ac = assertion.callee;
      const isAssert = ac.type === 'MemberExpression' && !ac.computed && methods.includes(ac.property.name) && ac.object.type === 'Identifier' && imported(ac.object.name, assertModules, []) ||
        ac.type === 'Identifier' && parsed.imports.some(i => i.local === ac.name && assertModules.includes(i.module) && methods.includes(i.member ?? ''));
      const call = assertion.arguments[0], expected = literal(assertion.arguments[1]);
      if (!isAssert || call.type !== 'CallExpression' || expected === undefined || !call.arguments.length || call.arguments.length > 3) continue;
      const target = call.callee, args = call.arguments.map(literal);
      const name = target.type === 'Identifier' ? target.name : target.type === 'MemberExpression' && !target.computed && target.object.type === 'Identifier' ? target.property.name : undefined;
      if (name && args.every((a: Value | undefined) => a !== undefined)) assertions.push({ call: { name, receiver: target.type === 'MemberExpression' ? target.object.name : undefined, args }, expected, line: s.loc.start.line, test: test.arguments[0].value });
    }
  }
  return { parsed, assertions };
}
const PY_CLAIMS = `import ast,json,math,sys
out=[]
for file,source in json.load(sys.stdin):
    try:
        tree=ast.parse(source)
        imports=[]
        for n in tree.body:
            if isinstance(n,ast.Import):
                imports.extend(dict(local=a.asname or a.name,module=a.name) for a in n.names)
            elif isinstance(n,ast.ImportFrom):
                imports.extend(dict(local=a.asname or a.name,module='.'*n.level+(n.module or ''),member=a.name) for a in n.names)
        def literal(n):
            v=ast.literal_eval(n)
            def valid(v,d=0):
                return d<=2 and (v is None or type(v)==bool or type(v)==str and len(v)<=256 or type(v) in (int,float) and math.isfinite(v) and abs(v)<=9007199254740991 or type(v)==list and len(v)<=12 and all(valid(x,d+1) for x in v))
            if not valid(v): raise ValueError()
            return v
        assertions=[]
        if any(isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store) and any(i['local']==n.id for i in imports) for n in ast.walk(tree)): continue
        def collect(fn,method=False):
            if not fn.name.startswith('test_') or fn.decorator_list or fn.args.defaults or fn.args.kwonlyargs or fn.args.vararg or fn.args.kwarg or len(fn.args.posonlyargs+fn.args.args)!=(1 if method else 0): return
            if any(not isinstance(s,(ast.Assert,ast.Expr,ast.Assign,ast.AnnAssign)) for s in fn.body): return
            if any(isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store) and any(i['local']==n.id for i in imports) for n in ast.walk(fn)): return
            for s in fn.body:
                left=right=None
                if isinstance(s,ast.Assert) and isinstance(s.test,ast.Compare) and len(s.test.ops)==1 and isinstance(s.test.ops[0],ast.Eq): left,right=s.test.left,s.test.comparators[0]
                if method and isinstance(s,ast.Expr) and isinstance(s.value,ast.Call):
                    c=s.value
                    if isinstance(c.func,ast.Attribute) and isinstance(c.func.value,ast.Name) and c.func.value.id==fn.args.args[0].arg and c.func.attr=='assertEqual' and len(c.args)==2 and not c.keywords: left,right=c.args
                if not isinstance(left,ast.Call) or left.keywords or not 0<len(left.args)<=3: continue
                c=left.func
                name=c.id if isinstance(c,ast.Name) else c.attr if isinstance(c,ast.Attribute) and isinstance(c.value,ast.Name) else None
                if not name: continue
                try:
                    call=dict(name=name,args=[literal(a) for a in left.args])
                    if isinstance(c,ast.Attribute): call['receiver']=c.value.id
                    assertions.append(dict(call=call,expected=literal(right),line=s.lineno,test=fn.name))
                except (ValueError,TypeError,SyntaxError): pass
        for n in tree.body:
            if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)): collect(n)
            if isinstance(n,ast.ClassDef) and not any(isinstance(m,ast.FunctionDef) and m.name=='assertEqual' for m in n.body):
                valid=any(isinstance(b,ast.Attribute) and isinstance(b.value,ast.Name) and b.attr=='TestCase' and any(i['local']==b.value.id and i['module']=='unittest' for i in imports) or isinstance(b,ast.Name) and any(i['local']==b.id and i['module']=='unittest' and i.get('member')=='TestCase' for i in imports) for b in n.bases)
                if valid:
                    for m in n.body:
                        if isinstance(m,(ast.FunctionDef,ast.AsyncFunctionDef)): collect(m,True)
        out.append(dict(parsed=dict(file=file,language='py',functions=[],calls=[],contracts=[],imports=imports,preamble=''),assertions=assertions))
    except (SyntaxError,ValueError,RecursionError): pass
print(json.dumps(out))
`;
function parseClaims(files: [string, string][], dir: string): ClaimFile[] {
  const js = files.filter(([f]) => !f.endsWith('.py')).flatMap(([f, s]) => jsClaims(f, s) ?? []);
  const py = files.filter(([f]) => f.endsWith('.py'));
  if (!py.length) return js;
  const r = spawnSync('python3', ['-c', PY_CLAIMS], { cwd: dir, input: JSON.stringify(py), encoding: 'utf8', maxBuffer: 512 * 1024 });
  try { return r.status === 0 ? [...js, ...JSON.parse(r.stdout)] : js; }
  catch { return js; /* Incomplete assertion parsing provides no claim evidence. */ }
}

export function documentClaims(unit: BehaviorUnit, old: Snapshot, next: Snapshot, tests: string[], current: TestRun, dir: string): DocumentClaim[] {
  const changed = tests.filter(f => !f.split('/').includes('bench') && next.get(f)!.data.length < 128 * 1024 && old.get(f)?.data.toString() !== next.get(f)!.data.toString()).slice(0, 20);
  const previous = parseClaims(changed.map(f => [f, old.get(f)?.data.toString() ?? '']), dir);
  const after = parseClaims(changed.map(f => [f, next.get(f)!.data.toString()]), dir);
  const fn = { name: unit.name, exported: unit.name, params: unit.params!, source: '', line: unit.line };
  const claims: DocumentClaim[] = [];
  for (const { parsed, assertions } of after) for (const a of assertions) {
    if (!importedUnit(parsed, a.call, unit.file, fn)) continue;
    const passed = current.passed.filter(id => parsed.language === 'js' ? id === a.test : id.split(/[^A-Za-z_0-9]+/).includes(a.test));
    if (passed.length !== 1 || locateTest(passed[0]!, next, tests) !== parsed.file) continue;
    const existed = previous.filter(p => p.parsed.file === parsed.file).some(p => p.assertions.some(b => importedUnit(p.parsed, b.call, unit.file, fn) &&
      JSON.stringify(b.call.args) === JSON.stringify(a.call.args) && JSON.stringify(b.expected) === JSON.stringify(a.expected)));
    if (!existed) claims.push({ args: a.call.args!, expected: a.expected, file: parsed.file, line: a.line, test: a.test });
  }
  return claims.slice(0, 4);
}
