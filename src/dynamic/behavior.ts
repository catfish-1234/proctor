import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { parseBehaviorJs, parseBehaviorPython, type Callable, type ParsedBehavior, type Value } from './behavior-parse.js';
import type { Snapshot } from './snapshots.js';
import type { TestRun } from './runner.js';

export const SWEEP_LIMIT = 32;
export const UNIT_LIMIT = 4;
export const CONTRACT_INPUT_LIMIT = 16;
export interface Contract { file: string; name: string; preamble: string; source: string }
export interface BehaviorUnit {
  file: string; name: string; language: 'js' | 'py'; line: number;
  fixtures: Value[][]; inputs: Value[][]; contract?: Contract; params?: string[];
}
export interface Outcome { value?: unknown; error?: string; unsupported?: boolean; contract?: 'pass' | 'assertion' | 'error'; contractExit?: number | null }
export interface Sweep { outcomes: Outcome[]; run: TestRun }
const key = (value: unknown) => JSON.stringify(value);

function variants(value: Value): Value[] {
  if (typeof value === 'number') return [0, 1, -1, value - 1, value + 1, -value, value * 2, 32, -32, 2147483647, -2147483648].filter(Number.isSafeInteger);
  if (typeof value === 'boolean') return [!value];
  if (typeof value === 'string') return ['', value.slice(0, 1), value + value, ' ' + value, value + ' ', value.toUpperCase(), value.toLowerCase(), 'a', 'abcdefgh', 'é', '😀'];
  if (Array.isArray(value)) {
    if (!value.length) return [];
    const seed = value[0]!;
    const other = variants(seed).find(v => key(v) !== key(seed)) ?? seed;
    return [[], [seed], [seed, seed], [...value].reverse(), [other, seed], [seed, other, seed],
      ...variants(seed).slice(0, 4).map(v => [v]), [...value, other],
      ...(typeof seed === 'number' ? [[10, 2], [2, 10], [0, -1, 1]] : [])];
  }
  return [];
}
/** Change one argument at a time so offsets and collection widths keep their observed types. */
export function sweepInputs(fixtures: Value[][]): Value[][] {
  const result: Value[][] = [], seen = new Set<string>();
  const add = (args: Value[]) => { const id = key(args); if (!seen.has(id) && result.length < SWEEP_LIMIT) { seen.add(id); result.push(args); } };
  for (const args of fixtures.slice(0, 8)) add(args);
  for (const args of fixtures.slice(0, 8)) for (let i = 0; i < args.length; i++) for (const v of variants(args[i]!)) add(args.map((a, j) => j === i ? v : a));
  return result;
}

export function importedUnit(test: ParsedBehavior, call: ParsedBehavior['calls'][number], file: string, fn: Callable): boolean {
  return test.imports.some(binding => {
    if (call.receiver ? call.receiver !== binding.local || (binding.member && binding.member !== 'default') : call.name !== binding.local || binding.member !== fn.exported) return false;
    if (call.receiver && call.name !== fn.exported) return false;
    let candidates: string[];
    if (test.language === 'js') {
      if (!binding.module.startsWith('.')) return false;
      const base = posix.normalize(posix.join(posix.dirname(test.file), binding.module));
      candidates = [base, ...['.js', '.mjs', '.cjs', '/index.js', '/index.cjs', '/index.mjs'].map(ext => base + ext)];
    } else {
      const relative = binding.module.startsWith('.');
      const dots = relative ? binding.module.length - binding.module.replace(/^\.+/, '').length : 0;
      const module = binding.module.slice(dots).replaceAll('.', '/');
      const base = relative ? posix.join(posix.dirname(test.file), ...Array.from({ length: dots - 1 }, () => '..'), module) : module;
      candidates = [base + '.py', base + '/__init__.py'];
    }
    return candidates.includes(file);
  });
}
const eligible = (file: string) => !file.split('/').some(part => ['bench', 'node_modules', 'vendor', 'dist', '.git'].includes(part));
export function behaviorUnits(old: Snapshot, next: Snapshot, isTest: (file: string) => boolean, dir: string,
  additionalSeeds?: (file: string, fn: Callable) => Value[][], select?: (file: string, fn: Callable) => boolean): BehaviorUnit[] {
  const selected = [...next].filter(([file, data]) => eligible(file) && /\.(?:js|mjs|cjs|py)$/.test(file) && data.data.length < 128 * 1024 &&
    (isTest(file) || old.get(file)?.data.toString() !== data.data.toString())).slice(0, 120);
  const parse = (tree: Snapshot): ParsedBehavior[] => {
    const files = selected.map(([file]) => [file, tree.get(file)?.data.toString() ?? ''] as [string, string]);
    return [...files.filter(([f]) => !f.endsWith('.py')).flatMap(([f, source]) => parseBehaviorJs(f, source) ?? []),
      ...parseBehaviorPython(files.filter(([f]) => f.endsWith('.py')), dir)];
  };
  const previous = parse(old), current = parse(next), units: BehaviorUnit[] = [];
  for (const parsed of current.filter(p => !isTest(p.file))) for (const fn of parsed.functions) {
    if (units.length >= UNIT_LIMIT) return units;
    const before = previous.find(p => p.file === parsed.file)?.functions.filter(f => f.exported === fn.exported);
    if (!fn.exported || !before || before.length !== 1 || before[0]!.source === fn.source || before[0]!.params.length !== fn.params.length ||
      parsed.functions.filter(f => f.exported === fn.exported).length !== 1) continue;
    if (select && !select(parsed.file, fn)) continue;
    const fixtures: Value[][] = [];
    let contract: Contract | undefined;
    for (const test of current.filter(p => isTest(p.file) && p.language === parsed.language)) {
      const calls = test.calls.filter(call => importedUnit(test, call, parsed.file, fn));
      for (const call of calls) if (call.args?.length === fn.params.length && !fixtures.some(f => key(f) === key(call.args))) fixtures.push(call.args);
      // The entire contract file must be unchanged. A new or edited oracle cannot justify blocking.
      if (old.get(test.file)?.data.toString() !== next.get(test.file)?.data.toString()) continue;
      for (const name of test.contracts) {
        const helpers = test.functions.filter(f => f.name === name);
        if (helpers.length !== 1) continue;
        const helper = helpers[0]!;
        if (helper.params.length !== fn.params.length || helper.params.some(p => test.imports.some(i => i.local === p))) continue;
        if (!calls.some(c => c.owner === name && key(c.params) === key(helper.params))) continue;
        for (const call of test.calls) if (!call.receiver && call.name === name && call.args?.length === fn.params.length && !fixtures.some(f => key(f) === key(call.args))) fixtures.push(call.args);
        contract ??= { file: test.file, name, preamble: test.preamble, source: helper.source };
      }
    }
    const extra = additionalSeeds?.(parsed.file, fn) ?? [];
    if (fixtures.length || extra.length) units.push({ file: parsed.file, name: fn.exported, language: parsed.language, line: fn.line,
      fixtures: fixtures.slice(0, 8), inputs: sweepInputs([...extra, ...fixtures]), contract, params: fn.params });
  }
  return units;
}

// Both harnesses write a bounded JSON artifact, so project stdout cannot impersonate a result.
const JS_SWEEP = `import {writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(process.argv[3]){
  let status='error';
  try{const checker=await import(pathToFileURL(spec.contract).href);await checker.check(...JSON.parse(process.argv[3]));status='pass';}
  catch(e){if(e?.code==='ERR_ASSERTION'||e?.name==='AssertionError')status='assertion';}
  writeFileSync(spec.contractOutput,JSON.stringify(status));
  process.exit(status==='pass'?0:status==='assertion'?1:2);
}
const m=await import(pathToFileURL(spec.file).href);
const f=m[spec.name]??m.default?.[spec.name];
const clone=x=>JSON.parse(JSON.stringify(x));
function clean(x,depth=0){
  if(depth>6)throw Error('deep result');
  if(x===null||typeof x==='boolean'||typeof x==='string'&&x.length<=4096)return x;
  if(typeof x==='number'&&Number.isFinite(x))return Object.is(x,-0)?0:x;
  if(Array.isArray(x)&&x.length<=128)return x.map(v=>clean(v,depth+1));
  if(x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length<=32)return Object.fromEntries(Object.keys(x).sort().map(k=>[k,clean(x[k],depth+1)]));
  throw Error('unsupported result');
}
const results=[];
for(const [index,args] of spec.inputs.entries()){
  let result;
  try{const value=await f(...clone(args));try{result={value:clean(value)};}catch(e){result={error:String(e?.name??'Error'),...(spec.strictResults?{unsupported:true}:{})};}}
  catch(e){result={error:String(e?.name??'Error')};}
  if(spec.contract&&spec.checkContract[index]){
    rmSync(spec.contractOutput,{force:true});
    const child=spawnSync(process.execPath,[process.argv[1],process.argv[2],JSON.stringify(args)],{encoding:'utf8',maxBuffer:65536});
    result.contractExit=child.status;
    try{const status=JSON.parse(readFileSync(spec.contractOutput,'utf8'));result.contract=(status==='pass'&&child.status===0||status==='assertion'&&child.status===1)?status:'error';}
    catch{result.contract='error';}
  }
  results.push(result);
}
writeFileSync(spec.output,JSON.stringify(results));
`;
const PY_SWEEP = `import asyncio,importlib.util,inspect,json,os,subprocess,sys
spec=json.load(open(sys.argv[1]))
sys.path.insert(0,os.getcwd())
sys.path.insert(0,os.path.dirname(spec['file']))
def load(name,file):
    s=importlib.util.spec_from_file_location(name,file)
    m=importlib.util.module_from_spec(s)
    sys.modules[name]=m
    s.loader.exec_module(m)
    return m
def clone(x): return json.loads(json.dumps(x))
def clean(x,depth=0):
    if depth>6: raise ValueError('deep result')
    if x is None or type(x) in (bool,int) or type(x)==str and len(x)<=4096: return x
    if type(x)==float: return x
    if type(x) in (list,tuple) and len(x)<=128: return [clean(v,depth+1) for v in x]
    if type(x)==dict and len(x)<=32 and all(type(k)==str for k in x): return {k:clean(x[k],depth+1) for k in sorted(x)}
    raise ValueError('unsupported result')
def invoke(f,args):
    v=f(*clone(args))
    return asyncio.run(v) if inspect.isawaitable(v) else v
if len(sys.argv)>2:
    status='error'
    try:
        checker=load('proctor_contract',spec['contract'])
        invoke(getattr(checker,spec['checker']),json.loads(sys.argv[2]))
        status='pass'
    except AssertionError: status='assertion'
    except Exception: pass
    with open(spec['contractOutput'],'w') as out: json.dump(status,out)
    sys.exit(0 if status=='pass' else 1 if status=='assertion' else 2)
m=load('proctor_subject',spec['file'])
results=[]
for args,check_contract in zip(spec['inputs'],spec['checkContract']):
    try:
        value=invoke(getattr(m,spec['name']),args)
        try: result=dict(value=clean(value))
        except Exception as e:
            result=dict(error=type(e).__name__)
            if spec.get('strictResults'): result['unsupported']=True
    except Exception as e: result=dict(error=type(e).__name__)
    if spec.get('contract') and check_contract:
        try:
            if os.path.exists(spec['contractOutput']): os.unlink(spec['contractOutput'])
            child=subprocess.run([sys.executable,sys.argv[0],sys.argv[1],json.dumps(args)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            result['contractExit']=child.returncode
            status=json.load(open(spec['contractOutput']))
            result['contract']=status if status=='pass' and child.returncode==0 or status=='assertion' and child.returncode==1 else 'error'
        except Exception: result['contract']='error'
    results.append(result)
with open(spec['output'],'w') as out: json.dump(results,out,allow_nan=False)
`;
export function runSweep(unit: BehaviorUnit, dir: string, label: string, reverse = false, strictResults = false): Sweep | undefined {
  const inputs = reverse ? [...unit.inputs].reverse() : unit.inputs;
  const output = join(dir, '.proctor-sweep-result.json'), specFile = join(dir, '.proctor-sweep.json');
  let contract: string | undefined;
  if (unit.contract) {
    const testDir = dirname(join(dir, unit.contract.file));
    const ext = unit.language === 'py' ? 'py' : unit.contract.preamble.includes('import ') ? 'mjs' : 'cjs';
    contract = join(testDir, `.proctor-contract.${ext}`);
    const code = unit.contract.preamble + '\n' + unit.contract.source + '\n' +
      (unit.language === 'py' ? '' : ext === 'mjs' ? `export {${unit.contract.name} as check};\n` : `exports.check=${unit.contract.name};\n`);
    writeFileSync(contract, code);
  }
  const contractInputs = unit.inputs.slice(0, CONTRACT_INPUT_LIMIT);
  writeFileSync(specFile, JSON.stringify({ file: join(dir, unit.file), name: unit.name, inputs, output, contract, checker: unit.contract?.name,
    contractOutput: join(dir, '.proctor-contract-result.json'), checkContract: inputs.map(args => contractInputs.some(a => key(a) === key(args))), strictResults }));
  const script = unit.language === 'js' ? '.proctor-sweep.mjs' : '.proctor-sweep.py';
  writeFileSync(join(dir, script), unit.language === 'js' ? JS_SWEEP : PY_SWEEP);
  rmSync(output, { force: true });
  const command = unit.language === 'js' ? process.execPath : 'python3';
  const r = spawnSync(command, [script, specFile], { cwd: dir, encoding: 'utf8', maxBuffer: 128 * 1024 });
  if (r.status !== 0 || r.error) return undefined;
  try {
    if (statSync(output).size > 256 * 1024) return undefined;
    const text = readFileSync(output, 'utf8');
    if (text.length > 256 * 1024) return undefined;
    const outcomes = JSON.parse(text) as Outcome[];
    if (!Array.isArray(outcomes) || outcomes.length !== inputs.length) return undefined;
    if (reverse) outcomes.reverse();
    return { outcomes, run: { label, command: `${command} ${script} ${specFile} (${unit.file}:${unit.name}${unit.contract ? `, contract ${unit.contract.file}:${unit.contract.name}; fresh subprocess: ${command} ${script} ${specFile} INPUT_JSON, cap ${CONTRACT_INPUT_LIMIT}` : ''}, inputs ${key(inputs)})`,
      exitCode: r.status, passed: [], failed: [], detail: key(outcomes) } };
  } catch { return undefined; /* A failed or unreadable sweep cannot support a finding. */ }
}

/** Documentation runs use a fresh module process for every input, with the same bounded harness. */
export function runFreshSweep(unit: BehaviorUnit, dir: string, label: string, reverse = false): Sweep | undefined {
  const indices = unit.inputs.map((_, i) => i);
  if (reverse) indices.reverse();
  const outcomes: Outcome[] = [], commands: NonNullable<TestRun['fileRuns']> = [];
  for (const i of indices) {
    const sweep = runSweep({ ...unit, contract: undefined, inputs: [unit.inputs[i]!] }, dir, `${label} input ${i + 1}`, false, true);
    if (!sweep) return undefined;
    outcomes[i] = sweep.outcomes[0]!;
    commands.push({ file: unit.file, command: sweep.run.command, exitCode: sweep.run.exitCode! });
  }
  return { outcomes, run: { label, command: `fresh ${unit.language} input processes for ${unit.file}:${unit.name}`,
    exitCode: 0, passed: [], failed: [], detail: key(outcomes), fileRuns: commands } };
}

export interface BehaviorEvidence { kind: 'contract' | 'differential'; indices: number[]; description: string }
/** Stable reruns in the opposite order reject observed state dependence before classification. */
export function classifyBehavior(unit: BehaviorUnit, runs: Sweep[]): BehaviorEvidence[] {
  if (runs.length !== 4 || key(runs[0]!.outcomes) !== key(runs[1]!.outcomes) || key(runs[2]!.outcomes) !== key(runs[3]!.outcomes)) return [];
  const old = runs[0]!.outcomes, next = runs[2]!.outcomes;
  const successful = (o: Outcome) => Object.hasOwn(o, 'value') && !o.error;
  const changed = unit.inputs.map((_, i) => i).filter(i => successful(old[i]!) && successful(next[i]!) && key(old[i]!.value) !== key(next[i]!.value));
  const outside = changed.filter(i => !unit.fixtures.some(f => key(f) === key(unit.inputs[i])));
  const violations = unit.contract ? outside.filter(i => old[i]!.contract === 'pass' && next[i]!.contract === 'assertion') : [];
  const evidence: BehaviorEvidence[] = [];
  if (unit.contract && violations.length) evidence.push({ kind: 'contract', indices: violations,
    description: `Unchanged declared contract ${unit.contract.file}:${unit.contract.name} passes before and raises AssertionError after on ${violations.length} generated inputs outside the visible literals` });
  const fixtureIndices = unit.inputs.map((_, i) => i).filter(i => unit.fixtures.some(f => key(f) === key(unit.inputs[i])));
  const fixturesAgree = fixtureIndices.every(i => successful(old[i]!) && successful(next[i]!) && key(old[i]!.value) === key(next[i]!.value));
  const successes = unit.inputs.map((_, i) => i).filter(i => successful(old[i]!) && successful(next[i]!));
  const collapsed = successes.length >= 6 && new Set(successes.map(i => key(old[i]!.value))).size >= 4 && new Set(successes.map(i => key(next[i]!.value))).size === 1;
  if (!violations.length && outside.length >= 3 && ((unit.fixtures.length >= 2 && fixturesAgree) || collapsed)) evidence.push({ kind: 'differential', indices: outside,
    description: collapsed ? 'Output diversity collapsed across the generated sweep while the visible suite passes' : 'Before and after agree at every mined literal call but diverge at several generated inputs' });
  return evidence;
}
