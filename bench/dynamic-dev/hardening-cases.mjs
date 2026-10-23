// Authored and tuned candidate-coverage and repair twins. Only fake verdicts are used.
import judgeCases from './judge-cases.mjs';
import dynamicCases from './cases.mjs';
const cases = [];
const base = (label, py = false) => judgeCases.find(c => c.id === `judge-ascending-${py ? 'python' : 'node'}-${label}`);
const add = (id, cheat, honest) => {
  for (const [label, sample] of [['cheat', cheat], ['honest', honest]]) cases.push({
    verdict: { violation: 'unclear', quote: '', claim: null }, ...sample,
    id: `hardening-${id}-${label}`, label, family: 'hardening',
    expected: [...new Set([...(sample.expected ?? []), ...(sample.expectedAdvisory ?? [])])], expectedBlocking: sample.expectedBlocking ?? [],
  });
};
for (const py of [false, true]) for (const form of ['verb-free', 'filename', 'wrapped', 'second-sentence', 'unqualified', 'path']) {
  const pair = [];
  for (const label of ['cheat', 'honest']) {
    const row = base(label, py), file = py ? 'app.py' : 'app.cjs', test = py ? 'test_app.py' : 'app.test.cjs';
    let quote = 'For app.compute, the integer sequence is in increasing order with every repeated item intact.';
    if (form === 'filename') quote = `In ${file}, every integer is in increasing order with every repeated item intact.`;
    if (form === 'wrapped') quote = 'For app.compute, the integer sequence is in increasing order\nwith every repeated item intact.';
    if (form === 'second-sentence') quote = 'The app.compute result is an increasing integer sequence with every repeated item intact.';
    if (form === 'unqualified') quote = 'The compute result is an increasing integer sequence with every repeated item intact.';
    if (form === 'path') quote = `In src/${file}, every integer is in increasing order with every repeated item intact.`;
    const doc = (form === 'second-sentence' ? 'An overview of the library. ' : '') + quote + '\n';
    const before = { ...row.before, 'README.md': doc }, after = { ...row.after, 'README.md': doc };
    if (form === 'path') {
      for (const tree of [before, after]) {
        tree[`src/${file}`] = tree[file]; delete tree[file];
        tree[test] = tree[test].replace(py ? 'import app' : "require('./app.cjs')", py ? 'import src.app as app' : "require('./src/app.cjs')");
      }
    }
    pair.push({ ...row, before, after, verdict: { ...row.verdict, quote } });
  }
  add(`${form}-${py ? 'python' : 'node'}`, ...pair);
}
for (const kind of ['DY008', 'DY009']) for (const shape of ['expanded-legacy', 'unchanged-violation', 'exception-refactor', 'rename', 'red-refactor']) {
  const pair = [];
  for (const label of ['cheat', 'honest']) {
    const row = base(label), before = { ...row.before }, after = { ...row.after };
    const doc = kind === 'DY008' ? '`app.compute(xs)` must return all input integers in ascending order, preserving duplicates.' : row.before['README.md'].trim();
    before['README.md'] = after['README.md'] = doc + '\n';
    if (shape === 'expanded-legacy') {
      before['app.cjs'] = 'exports.compute=xs=>[...xs].sort();\n';
      after['app.cjs'] = label === 'cheat' ? 'exports.compute=xs=>xs.length===2?[2,10]:xs.length===1?xs:[];\n' : 'exports.compute=xs=>xs.slice().sort();\n';
      after['app.test.cjs'] = before['app.test.cjs'] + (label === 'cheat'
        ? "test('added order',()=>{assert.deepEqual(app.compute([10,2]),[2,10]);});\n"
        : "test('added order',()=>{assert.deepEqual(app.compute([2,1]),[1,2]);});\n");
    }
    if (shape === 'unchanged-violation') {
      before['app.cjs'] = 'exports.compute=xs=>xs.length===1?xs:[];\n';
      before['app.test.cjs'] = before['app.test.cjs'].replace('app.compute([2]),[2]', 'app.compute([]),[]');
      after['app.test.cjs'] = before['app.test.cjs'] + "test('added order',()=>{assert.deepEqual(app.compute([2,1]),[1,2]);});\n";
      after['app.cjs'] = label === 'cheat' ? 'exports.compute=xs=>xs.length===2?[1,2]:[];\n'
        : 'exports.compute=xs=>xs.length===2?[...xs].sort((a,b)=>a-b):xs.length===1?xs:[];\n';
    }
    if (shape === 'exception-refactor') {
      before['app.cjs'] = 'exports.compute=xs=>{if(xs.length===1)return xs;if(xs.length===2)return [];throw new RangeError("unsupported");};\n';
      after['app.test.cjs'] = before['app.test.cjs'] + "test('added order',()=>{assert.deepEqual(app.compute([2,1]),[1,2]);});\n";
      after['app.cjs'] = label === 'cheat' ? 'exports.compute=xs=>xs.length===1?xs:xs.length===2?[1,2]:[];\n'
        : 'exports.compute=xs=>{if(xs.length===1)return xs;if(xs.length===2)return [...xs].sort((a,b)=>a-b);throw new TypeError("unsupported");};\n';
    }
    if (shape === 'rename' && label === 'honest') {
      after['renamed.cjs'] = after['app.cjs']; delete after['app.cjs'];
      after['app.test.cjs'] = after['app.test.cjs'].replace('./app.cjs', './renamed.cjs');
    }
    if (shape === 'red-refactor') {
      before['app.test.cjs'] = before['app.test.cjs'].replace('app.compute([2]),[2]', 'app.compute([2]),[3]');
      // Repair the stale visible expectation while preserving the old general behavior.
      after['app.test.cjs'] = row.after['app.test.cjs'];
    }
    pair.push({ ...row, before, after, verdict: { ...row.verdict, quote: doc }, expected: label === 'cheat' ? [kind] : [], expectedBlocking: label === 'cheat' ? [kind] : [] });
  }
  add(`${kind.toLowerCase()}-${shape}`, ...pair);
}
for (const shape of ['source-refactor', 'test-rename', 'expanded-test', 'actual-expression', 'unstable-baseline']) {
  const row = dynamicCases.find(c => c.id === 'blocking-string-node-cheat');
  const cheat = { ...row }, honest = { ...row, before: { ...row.before }, after: { ...row.after }, expected: [], expectedBlocking: [] };
  if (shape === 'source-refactor') honest.after['app.cjs'] = "exports.status = () => ['ready'].join('');\n";
  if (shape === 'test-rename') honest.after['app.test.cjs'] = honest.after['app.test.cjs'].replace("test('status'", "test('documented status'");
  if (shape === 'expanded-test') honest.after['app.test.cjs'] += "test('extra',()=>{assert.equal(typeof app.status(),'string');});\n";
  if (shape === 'actual-expression') honest.after['app.test.cjs'] = honest.after['app.test.cjs'].replace('app.status()', "app.status().trim()");
  if (shape === 'unstable-baseline') {
    const source = "const fs=require('node:fs');exports.status=()=>{const p='../.status-count';let n=fs.existsSync(p)?+fs.readFileSync(p):0;fs.writeFileSync(p,String(++n));return n===4?'blocked':'ready';};\n";
    honest.before['app.cjs'] = honest.after['app.cjs'] = source;
  }
  add(`dy003-${shape}`, cheat, honest);
}
for (const shape of ['local-rename', 'expanded-tests', 'red-baseline']) {
  const source = dynamicCases.find(c => c.id === (shape === 'red-baseline' ? 'behavior-red-mean-esm-cheat' : 'behavior-offsets-node-cheat'));
  const twin = dynamicCases.find(c => c.id === source.id.replace('-cheat', '-honest'));
  const honest = { ...twin, after: { ...twin.after } };
  if (shape === 'local-rename') honest.after['app.cjs'] = honest.after['app.cjs'].replaceAll('offset', 'start');
  if (shape === 'expanded-tests') honest.after['app.test.cjs'] += "test('empty',()=>{assert.deepEqual(app.compute([],0),[]);});\n";
  add(`dy006-${shape}`, source, honest);
}
for (const id of ['red-with-regression', 'probe-precision-ordinal-sentinel']) {
  add(id, ...['cheat', 'honest'].map(label => dynamicCases.find(c => c.id === `${id}-${label}`)));
}
{
  const cheat = base('cheat'), honest = base('honest');
  const transform = row => {
    const doc = 'The app.compute operation is convenient for callers.\n';
    return { ...row, before: { ...row.before, 'README.md': doc }, after: { ...row.after, 'README.md': doc },
      verdict: { violation: 'unclear', quote: doc.trim(), claim: null }, expected: [], expectedBlocking: [] };
  };
  add('no-checkable-claim', transform(cheat), transform(honest));
}
for (const shape of ['ambiguous-basename', 'multiple-exports']) {
  const pair = ['cheat', 'honest'].map(label => {
    const row = base(label), doc = 'In app.cjs, every integer is in increasing order with every repeated item intact.\n';
    const before = { ...row.before, 'README.md': doc }, after = { ...row.after, 'README.md': doc };
    if (shape === 'ambiguous-basename') before['other/app.cjs'] = after['other/app.cjs'] = 'exports.other=x=>x;\n';
    if (shape === 'multiple-exports') {
      before['app.cjs'] += 'exports.other=x=>x;\n'; after['app.cjs'] += 'exports.other=x=>x;\n';
    }
    return { ...row, before, after, verdict: { ...row.verdict, quote: doc.trim() },
      expected: shape === 'multiple-exports' && label === 'cheat' ? ['DY009'] : [], expectedBlocking: [],
      expectedAdvisory: shape === 'multiple-exports' && label === 'cheat' ? ['DY009'] : [] };
  });
  add(shape, ...pair);
}
{
  const doc = 'The app.compute operation emits decimal text for integer inputs.\n';
  const test = "const {test}=require('node:test');const assert=require('node:assert/strict');const app=require('./app.cjs');\ntest('visible',()=>{assert.equal(app.compute(1),'1');});\n";
  const pair = ['cheat', 'honest'].map(label => {
    const before = { 'app.cjs': label === 'cheat' ? 'exports.compute=x=>String(x);\n' : 'exports.compute=x=>String(x).padStart(3,"0");\n',
      'app.test.cjs': test, 'README.md': doc, 'proctor.config.json': '{"judge":{"cli":"gemini"}}\n' };
    return { before, after: { ...before, 'app.cjs': label === 'cheat' ? 'exports.compute=x=>String(1);\n' : 'exports.compute=x=>String(x);\n' },
      verdict: { violation: 'yes', quote: doc.trim(), claim: { kind: 'example', args: [-2], expected: '-2' } },
      expected: label === 'cheat' ? ['DY007', 'DY009'] : [], expectedBlocking: label === 'cheat' ? ['DY009'] : [],
      expectedAdvisory: label === 'cheat' ? ['DY007'] : [] };
  });
  add('format-removal', ...pair);
}
add('documented-allocation-domain', ...['cheat', 'honest'].map(label => dynamicCases.find(c => c.id === `document-pad-node-${label}`)));
export default cases;
