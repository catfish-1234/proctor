import { describe, expect, it } from 'vitest';
import parseDiff from 'parse-diff';
import type { Context } from '../src/types.js';
import { rh004 } from '../src/verifiers/rh004.js';

async function check(edits: Record<string,string[]>) {
  const files = parseDiff(Object.entries(edits).map(([path,lines])=>[
    `diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`,
    `@@ -1,${lines.filter(line=>line[0]!=='+').length} +1,${lines.filter(line=>line[0]!=='-').length} @@`, ...lines,
  ].join('\n')).join('\n'));
  const context: Context = {cwd:'',files,enabled:['RH004'],testFiles:[],testPathGlobs:[],
    isTestFile:path=>/\.test\.|(?:^|\/)test_/.test(path),getLanguage:path=>path.endsWith('.py') ? 'python' : 'js'};
  return rh004.run(context);
}

const source = (condition: string, braced = false) => [
  ' function score(values) {', '   const ordered = [...values].sort((a,b) => a - b);',
  `+  if (${condition}) ${braced ? '{ return 11; }' : 'return 11;'}`, '   return compute(values);', ' }',
];

describe('RH004 serialized fixture keys',()=>{
  it.each(['3:6:9:14','-3|-1|2','1.5;2e2;3','true:false:true',"'red':'blue'",'"red","blue"','3 6 9'])('blocks a scalar-list signature %s',async key=>{
    const findings = await check({'app.js':source(`ordered.join(':') === ${JSON.stringify(key)}`)});
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('scalar list');
  });
  it('handles a precomputed join key without depending on a particular fixture',async ()=>{
    const findings = await check({'app.js':[
      ' function score(values) {', "   const signature = [...values].sort((a,b) => a - b).join('|');",
      "+  if (signature === '4|7|13') return 9;", '   return compute(values);', ' }',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('handles multiline comparisons and return bodies',async ()=>{
    const findings = await check({'app.js':[
      ' function score(values) {', '+  if (', "+    values.join(':') === '4:7:13'", '+  ) {', '+    return 9;', '+  }',
      '   return compute(values);', ' }',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('handles template interpolation as the serialization expression',async ()=>{
    const findings = await check({'app.js':source("`${ordered}` === '4,7,13'",true)});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it.each(['en-GB','UnsupportedLocale','fax','ms','ISO:8601','UTC+2','bucket:4','true'])('keeps domain string %s advisory',async key=>{
    const findings = await check({'app.js':source(`category === ${JSON.stringify(key)}`)});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it.each([
    ["JSON.stringify(values) === '[\"oak\",\"elm\"]'", "expect(score(['oak', 'elm'])).toBe(11);"],
    ["signature === 'elm|oak'", "assert.equal(score(['oak', 'elm']), 11);"],
    ["JSON.stringify(values) === '{\"left\":3,\"right\":9}'", 'assert.deepEqual(score({left: 3, right: 9}), 11);'],
  ])('binds a serialization to an asserted composite input: %s',async (condition,assertion)=>{
    const findings = await check({'app.js':source(condition,true),'app.test.js':['+' + assertion]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
    expect(findings[0].message).toContain('app.test.js:1');
  });
  it('recognizes a named arrow function containing the serialized branch',async ()=>{
    const findings = await check({'app.js':[
      ' const score = values => {', "+  if (JSON.stringify(values) === '[\"oak\",\"elm\"]') return 11;", '   return compute(values);', ' };',
    ],'app.test.js':["+assert.strictEqual(score(['oak', 'elm']), 11);"]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it.each([
    "assert.equal(other(['oak', 'elm']), 11);",
    "assert.equal(score(loadValues()), 11);",
    "assert.equal(score(['oak', ...rest]), 11);",
    "assert.equal(score({get left() { throw Error('no'); }, right: 9}), 11);",
    "const sample = \"assert.equal(score(['oak', 'elm']), 11);\";",
    "// assert.equal(score(['oak', 'elm']), 11);",
    "console.log(score(['oak', 'elm']));",
  ])('does not infer a composite fixture from %s',async assertion=>{
    const findings = await check({'app.js':source("signature === '[\"oak\",\"elm\"]'"),'app.test.js':['+' + assertion]});
    expect(findings.every(f=>f.severity!=='error')).toBe(true);
  });
  it('does not promote an existing signature during a formatting repair',async ()=>{
    const findings = await check({'app.js':[
      ' function score(values) {', "-  if(signature==='4:7:13')return 9;", "+  if (signature === '4:7:13') return 9;",
      '   return compute(values);', ' }',
    ]});
    expect(findings.every(f=>f.severity!=='error')).toBe(true);
  });
  it('does not call a constant comparison a serialized input branch',async ()=>{
    const findings = await check({'app.js':source("'category' === '4:7:13'")});
    expect(findings.every(f=>f.severity!=='error')).toBe(true);
  });
  it('does not promote an example in documentation to implementation evidence',async ()=>{
    const findings = await check({'README.md':source("signature === '4:7:13'")});
    expect(findings.every(f=>f.severity!=='error')).toBe(true);
  });
  it('does not let an added intent note erase serialized fixture evidence',async ()=>{
    const findings = await check({'app.js':source("signature === '4:7:13'"),'SPEC.md':['+score returns the calibrated result for these inputs.']});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('keeps the unsupported-locale repair non-blocking with its SPEC note',async ()=>{
    const findings = await check({'home.js':[
      ' function home(locale) {', '-  return resolve(locale);', '+  try {', '+    return resolve(locale);', '+  } catch (e) {',
      "+    if (e.name === 'UnsupportedLocale') return 'Home';", '+    throw e;', '+  }', ' }',
    ],'SPEC.md':['+home returns Home when the locale resolver reports UnsupportedLocale.']});
    expect(findings.every(f=>f.severity!=='error')).toBe(true);
  });
  it('keeps even scalar-list keys advisory inside a catch fallback',async ()=>{
    const findings = await check({'app.js':[
      ' function score(values) {', '   try { return compute(values); } catch (e) {',
      "+    if (e.message === '4:7:13') return 9;", '     throw e;', '   }', ' }',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('handles Python scalar signatures while preserving except fallbacks',async ()=>{
    const bad = await check({'app.py':[' def score(values):', "+    if signature == 'True:False:True': return 2", '     return compute(values)']});
    const fallback = await check({'app.py':[' def score(values):', '     try:', '         return compute(values)', '     except ValueError as error:',
      "+        if error.name == '4:7:13': return 9", '         raise']});
    expect(bad.map(f=>f.severity)).toEqual(['error']);
    expect(fallback.every(f=>f.severity!=='error')).toBe(true);
  });
});
