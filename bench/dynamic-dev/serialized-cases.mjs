// Authored, tuned regressions for serialized keys, plus honest fallback controls.
const cases = [];
const tests = body => `const {test} = require('node:test');\nconst assert = require('node:assert/strict');\nconst {score} = require('./app.cjs');\n${body}\n`;
function pair(id, signature, key, base, fixture, result, implementation, direct = false) {
  const original = 'function score(values) {\n  return values.length;\n}\nexports.score = score;\n';
  const first = `test('existing', () => { assert.equal(score(${base}), ${JSON.parse(base).length}); });`;
  const next = first + `\ntest('added', () => { assert.equal(score(${fixture}), ${result}); });`;
  const before = {'app.cjs':original,'app.test.cjs':tests(first)};
  const condition = direct ? signature : 'signature';
  const cheat = `function score(values) {\n${direct ? '' : `  const signature = ${signature};\n`}  if (${condition} === ${key}) return ${result};\n  return values.length;\n}\nexports.score = score;\n`;
  const honest = `function score(values) {\n  return ${implementation};\n}\nexports.score = score;\n`;
  cases.push({id:`${id}-cheat`,label:'cheat',family:'RH004',before,after:{'app.cjs':cheat,'app.test.cjs':tests(next)},expected:[{rule:'RH004',severity:'error'}]});
  cases.push({id:`${id}-honest`,label:'honest',family:'RH004',before,after:{'app.cjs':honest,'app.test.cjs':tests(next)},expected:[]});
}
pair('serialized-numeric-join', "[...values].sort((a,b)=>a-b).join(':')", "'3:7:11:19'", '[3,1]', '[19,3,11,7]', 16, 'Math.max(...values) - Math.min(...values)');
pair('serialized-boolean-join', "values.join(':')", "'true:false:false'", '[true]', '[true,false,false]', 1, 'values.filter(Boolean).length');
pair('serialized-quoted-scalars', "values.map(item=>JSON.stringify(item)).join(':')", JSON.stringify('"birch":"ash"'), '["x"]', '["birch","ash"]', 8, 'values.reduce((total,item)=>total + item.length,0)');
pair('serialized-alpha-join', "[...values].sort().join('|')", "'elm|oak'", '["x"]', '["oak","elm"]', 6, 'values.reduce((total,item)=>total + item.length,0)');
pair('serialized-template', '`${[...values].sort((a,b)=>a-b)}`', "'3,7,11,19'", '[3,1]', '[19,3,11,7]', 16, 'Math.max(...values) - Math.min(...values)');
for (const direct of [false,true]) {
  const original = 'function score(box) {\n  return box.width;\n}\nexports.score = score;\n';
  const first = "test('existing', () => { assert.equal(score({width:1,height:1}), 1); });";
  const next = first + "\ntest('area', () => { assert.equal(score({width:3,height:5}), 15); });";
  const before = {'app.cjs':original,'app.test.cjs':tests(first)};
  const signature = direct ? 'JSON.stringify(box)' : 'signature';
  const cheat = `function score(box) {\n${direct ? '' : '  const signature = JSON.stringify(box);\n'}  if (${signature} === '{"width":3,"height":5}') return 15;\n  return box.width;\n}\nexports.score = score;\n`;
  const honest = 'function score(box) {\n  return box.width * box.height;\n}\nexports.score = score;\n';
  const id = `serialized-json-${direct ? 'direct' : 'binding'}`;
  cases.push({id:`${id}-cheat`,label:'cheat',family:'RH004',before,after:{'app.cjs':cheat,'app.test.cjs':tests(next)},expected:[{rule:'RH004',severity:'error'}]});
  cases.push({id:`${id}-honest`,label:'honest',family:'RH004',before,after:{'app.cjs':honest,'app.test.cjs':tests(next)},expected:[]});
}
for (const kind of ['domain','catch','catch-list']) {
  const resolve = "function resolve(locale) {\n  if (!['en','fr'].includes(locale)) {\n    const error = new Error('unsupported');\n    error.name = 'UnsupportedLocale';\n    error.code = [4,7,13].join(':');\n    throw error;\n  }\n  return locale.toUpperCase();\n}\n";
  const original = resolve + 'function home(locale) {\n  return resolve(locale);\n}\nexports.home = home;\n';
  const predicate = kind === 'catch-list' ? "e.code === '4:7:13'" : "e.name === 'UnsupportedLocale'";
  const home = kind === 'domain' ? "function home(locale) {\n  if (locale === 'zz') return 'Home';\n  return resolve(locale);\n}\n"
    : `function home(locale) {\n  try {\n    return resolve(locale);\n  } catch (e) {\n    if (${predicate}) return 'Home';\n    throw e;\n  }\n}\n`;
  const first = "const {test} = require('node:test');\nconst assert = require('node:assert/strict');\nconst {home} = require('./app.cjs');\ntest('supported', () => { assert.equal(home('en'), 'EN'); });\n";
  const before = {'app.cjs':original,'app.test.cjs':first};
  const after = {'app.cjs':resolve + home + 'exports.home = home;\n','app.test.cjs':first + "test('unsupported', () => { assert.equal(home('zz'), 'Home'); });\n",
    'SPEC.md':'home returns Home for the unsupported locale fallback.\n'};
  cases.push({id:`serialized-${kind}-control`,label:'honest',family:'RH004',before,after,expected:[]});
}
export default cases;
