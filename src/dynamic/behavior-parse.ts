import { parse } from 'acorn';
import { spawnSync } from 'node:child_process';

export type Value = null | boolean | number | string | Value[];
export interface Callable { name: string; exported: string; params: string[]; source: string; line: number }
export interface Call { receiver?: string; name: string; args?: Value[]; params?: string[]; owner?: string }
export interface Import { local: string; module: string; member?: string }
export interface ParsedBehavior {
  file: string; language: 'js' | 'py'; functions: Callable[]; calls: Call[];
  imports: Import[]; preamble: string; contracts: string[];
  identifiers?: string[];
}
// Acorn nodes have different fields for each syntax kind. Inspect them only after checking type.
type Ast = any;
function literal(node: Ast, depth = 0): Value | undefined {
  if (depth > 2) return undefined;
  if (node?.type === 'Literal' && (node.value === null || typeof node.value === 'boolean' || typeof node.value === 'string' && node.value.length <= 256 ||
    (typeof node.value === 'number' && Number.isSafeInteger(node.value)))) return node.value;
  if (node?.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && Number.isSafeInteger(node.argument.value)) return -node.argument.value;
  if (node?.type === 'ArrayExpression' && node.elements.length <= 12) {
    const values = node.elements.map((n: Ast) => literal(n, depth + 1));
    if (values.every((v: Value | undefined) => v !== undefined)) return values;
  }
  return undefined;
}
export function parseBehaviorJs(file: string, source: string): ParsedBehavior | undefined {
  try {
    const contracts: string[] = [];
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true,
      onComment: (block, text) => {
        const match = /^proctor:contract ([A-Za-z_][A-Za-z_0-9]*)$/.exec(text.trim());
        if (!block && match) contracts.push(match[1]!);
      } }) as Ast;
    const functions: Callable[] = [], imports: Import[] = [], preamble: string[] = [], calls: Call[] = [];
    const exported = new Map<string, string>();
    const define = (name: string, node: Ast, text: string) => {
      if (!node.params.length || node.params.length > 3 || node.params.some((p: Ast) => p.type !== 'Identifier')) return;
      functions.push({ name, exported: '', params: node.params.map((p: Ast) => p.name), source: text, line: node.loc.start.line });
    };
    const member = (node: Ast, object: string) => node?.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === object ? node.property.name : undefined;
    for (const statement of ast.body) {
      const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (node?.type === 'FunctionDeclaration') define(node.id.name, node, source.slice(node.start, node.end));
      if (node?.type === 'VariableDeclaration') for (const d of node.declarations) {
        if (d.id.type === 'Identifier' && ['FunctionExpression', 'ArrowFunctionExpression'].includes(d.init?.type)) define(d.id.name, d.init, `const ${d.id.name} = ${source.slice(d.init.start, d.init.end)};`);
        if (node.declarations.length === 1 && d.init?.type === 'CallExpression' && d.init.callee.name === 'require' && d.init.arguments.length === 1 && typeof d.init.arguments[0]?.value === 'string') {
          const module = d.init.arguments[0].value;
          if (d.id.type === 'Identifier') imports.push({ local: d.id.name, module });
          if (d.id.type === 'ObjectPattern') for (const p of d.id.properties) if (!p.computed && p.type === 'Property' && p.key.type === 'Identifier' && p.value.type === 'Identifier') imports.push({ local: p.value.name, module, member: p.key.name });
          preamble.push(source.slice(node.start, node.end));
        }
      }
      if (statement.type === 'ImportDeclaration') {
        preamble.push(source.slice(statement.start, statement.end));
        for (const s of statement.specifiers) imports.push({ local: s.local.name, module: statement.source.value, member: s.type === 'ImportSpecifier' ? s.imported.name : s.type === 'ImportDefaultSpecifier' ? 'default' : undefined });
      }
      if (statement.type === 'ExportNamedDeclaration') {
        if (node?.type === 'FunctionDeclaration') exported.set(node.id.name, node.id.name);
        if (node?.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') exported.set(d.id.name, d.id.name);
        if (!statement.source) for (const s of statement.specifiers) exported.set(s.local.name, s.exported.name);
      }
      if (statement.type === 'ExpressionStatement' && node.expression?.type === 'AssignmentExpression' && node.expression.operator === '=') {
        const { left, right } = node.expression;
        const name = member(left, 'exports') ?? (left.type === 'MemberExpression' && !left.computed && member(left.object, 'module') === 'exports' ? left.property.name : undefined);
        if (name && right.type === 'Identifier') exported.set(right.name, name);
        if (name && ['FunctionExpression', 'ArrowFunctionExpression'].includes(right.type)) {
          define(name, right, `const ${name} = ${source.slice(right.start, right.end)};`); exported.set(name, name);
        }
      }
    }
    const identifiers = new Set<string>();
    function walk(node: Ast, owner?: string): void {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier') identifiers.add(node.name);
      if (node.type === 'Literal' && typeof node.value === 'string') identifiers.add(node.value);
      if (node.type === 'FunctionDeclaration') owner = node.id.name;
      if (node.type === 'CallExpression' && node.arguments.length > 0 && node.arguments.length <= 3) {
        const c = node.callee;
        const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' ? c.property.name : undefined;
        if (name) {
          const args = node.arguments.map((n: Ast) => literal(n));
          calls.push({ name, receiver: c.type === 'MemberExpression' ? c.object.name : undefined, owner,
            args: args.every((v: Value | undefined) => v !== undefined) ? args : undefined,
            params: node.arguments.every((a: Ast) => a.type === 'Identifier') ? node.arguments.map((a: Ast) => a.name) : undefined });
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) if (child?.type) walk(child, owner); }
        else if (value && typeof value === 'object' && 'type' in value) walk(value, owner);
      }
    }
    walk(ast);
    for (const f of functions) f.exported = exported.get(f.name) ?? '';
    return { file, language: 'js', functions, calls, imports, preamble: preamble.join('\n'), contracts, identifiers: [...identifiers] };
  } catch { return undefined; /* Unsupported syntax is not runtime evidence. */ }
}

const PYTHON_PARSE = `import ast,io,json,sys,tokenize
out=[]
for file,source in json.load(sys.stdin):
    try:
        tree=ast.parse(source)
        functions=[]
        imports=[]
        preamble=[]
        calls=[]
        contracts=[]
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type==tokenize.COMMENT and token.string.startswith('# proctor:contract '):
                name=token.string[len('# proctor:contract '):].strip()
                if name.isidentifier() and name.isascii(): contracts.append(name)
        def value(node):
            result=ast.literal_eval(node)
            def valid(v,depth=0):
                return depth<=2 and (v is None or type(v)==bool or type(v)==str and len(v)<=256 or type(v)==int and abs(v)<=9007199254740991 or type(v)==list and len(v)<=12 and all(valid(x,depth+1) for x in v))
            if not valid(result): raise ValueError()
            return result
        for node in tree.body:
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and not node.decorator_list and not node.args.defaults and not node.args.kwonlyargs and not node.args.vararg and not node.args.kwarg:
                params=[a.arg for a in node.args.posonlyargs+node.args.args]
                if 0<len(params)<=3: functions.append(dict(name=node.name,exported=node.name,params=params,source=ast.get_source_segment(source,node),line=node.lineno))
            if isinstance(node,(ast.Import,ast.ImportFrom)):
                preamble.append(ast.get_source_segment(source,node))
                for a in node.names:
                    if isinstance(node,ast.Import): imports.append(dict(local=a.asname or a.name,module=a.name))
                    else: imports.append(dict(local=a.asname or a.name,module='.'*node.level+(node.module or ''),member=a.name))
        def walk(node,owner=None):
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)): owner=node.name
            if isinstance(node,ast.Call) and not node.keywords and 0<len(node.args)<=3:
                c=node.func
                name=c.id if isinstance(c,ast.Name) else c.attr if isinstance(c,ast.Attribute) and isinstance(c.value,ast.Name) else None
                if name:
                    call=dict(name=name,owner=owner)
                    if isinstance(c,ast.Attribute): call['receiver']=c.value.id
                    try: call['args']=[value(a) for a in node.args]
                    except (ValueError,TypeError,SyntaxError): pass
                    if all(isinstance(a,ast.Name) for a in node.args): call['params']=[a.id for a in node.args]
                    calls.append(call)
            for child in ast.iter_child_nodes(node): walk(child,owner)
        walk(tree)
        identifiers={n.id for n in ast.walk(tree) if isinstance(n,ast.Name)}|{n.name for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}|{n.attr for n in ast.walk(tree) if isinstance(n,ast.Attribute)}|{n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and type(n.value)==str}
        out.append(dict(file=file,language='py',functions=functions,calls=calls,imports=imports,preamble='\\n'.join(preamble),contracts=contracts,identifiers=sorted(identifiers)))
    except (SyntaxError,ValueError,RecursionError,tokenize.TokenError): pass
print(json.dumps(out))
`;
export function parseBehaviorPython(files: [string, string][], dir: string): ParsedBehavior[] {
  if (!files.length) return [];
  const r = spawnSync('python3', ['-c', PYTHON_PARSE], { cwd: dir, input: JSON.stringify(files), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (r.status !== 0) return [];
  try {
    return JSON.parse(r.stdout) as ParsedBehavior[];
  } catch { return []; /* An incomplete parser response cannot identify a callable. */ }
}
