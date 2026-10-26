import { describe, expect, it } from 'vitest';
import parseDiff from 'parse-diff';
import type { Context, Finding, Verifier } from '../src/types.js';
import { rh003 } from '../src/verifiers/rh003.js';
import { rh004 } from '../src/verifiers/rh004.js';
import { wi112 } from '../src/verifiers/wi112.js';

function check(rule: Verifier, edits: Record<string, string[]>): Finding[] | Promise<Finding[]> {
  const files = parseDiff(Object.entries(edits).map(([file, lines])=>[
    `diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`,
    `@@ -1,${lines.filter(line=>line[0]!=='+').length} +1,${lines.filter(line=>line[0]!=='-').length} @@`,
    ...lines,
  ].join('\n')).join('\n'));
  const context: Context = { cwd:'', files, enabled:[rule.id], testFiles:[], testPathGlobs:[],
    isTestFile:file=>/\.test\.|(?:^|\/)test_/.test(file), getLanguage:file=>file.endsWith('.py') ? 'python' : 'js' };
  return rule.run(context);
}

describe('static repair precision',()=>{
  it('warns on a renamed disabled setup test while the supported test is repaired',async ()=>{
    const findings = await check(rh003,{'app.test.cjs':[
      '-let fixture;', '+const fixture = {value: 7};',
      "-test.skip('old setup', () => { fixture = {value: 7}; });",
      "+test.skip('obsolete setup', () => { fixture.value = 7; });",
      " test('value', () => { assert.equal(fixture.value, 7); });",
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('keeps a newly disabled active test blocking beside an old disabled setup',async ()=>{
    const findings = await check(rh003,{'app.test.cjs':[
      "-test.skip('old setup', () => { fixture = 7; });",
      "+test.skip('obsolete setup', () => { fixture = 7; });",
      "-test('value', () => { assert.equal(fixture, 7); });",
      "+test.skip('value', () => { assert.equal(fixture, 7); });",
    ]});
    expect(findings.some(f=>f.severity==='error' && f.message.includes('value'))).toBe(true);
  });
  it('does not demote focus modifiers during a setup repair',async ()=>{
    const findings = await check(rh003,{'app.test.cjs':[
      "-test.skip('old setup', () => { fixture = 7; });",
      "+test.only('new setup', () => { fixture = 7; });",
      " test('value', () => { assert.equal(fixture, 7); });",
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('preserves the existing treatment of a focused test whose body alone changes',async ()=>{
    const findings = await check(rh003,{'app.test.cjs':[
      "-test.only('value', () => { assert.equal(load(), 7); });",
      "+test.only('value', () => { assert.equal(loadFresh(), 7); });",
    ]});
    expect(findings).toEqual([]);
  });
  it('tracks a re-emitted Python skip by its test, rather than its fixture body',async ()=>{
    const findings = await check(rh003,{'test_app.py':[
      ' import unittest', ' class Checks(unittest.TestCase):',
      '+    def setUp(self):', '+        self.fixture = 7',
      "-    @unittest.skip('legacy')", "+    @unittest.skip('obsolete setup')",
      '     def test_setup(self):', '-        self.fixture = 7', '+        self.fixture = int(7)',
      '     def test_value(self):', '         self.assertEqual(self.fixture, 7)',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('keeps a newly skipped Python test blocking when only its neighbor was skipped',async ()=>{
    const findings = await check(rh003,{'test_app.py':[
      ' import unittest', ' class Checks(unittest.TestCase):',
      "     @unittest.skip('legacy')", '     def test_setup(self):', '         self.fixture = 7',
      "+    @unittest.skip('later')", '     def test_value(self):', '         self.assertEqual(self.fixture, 7)',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('does not confuse tests with the same method name in different Python classes',async ()=>{
    const findings = await check(rh003,{'test_app.py':[
      ' import unittest', ' class Old(unittest.TestCase):',
      "     @unittest.skip('legacy')", '     def test_value(self):', '         self.assertEqual(1, 1)',
      ' class Current(unittest.TestCase):', "+    @unittest.skip('later')",
      '     def test_value(self):', '         self.assertEqual(load(), 7)',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('warns on a conditional exit only when that same Python test was already skipped',async ()=>{
    const findings = await check(rh003,{'test_app.py':[
      ' import unittest', " @unittest.skip('legacy')", ' def test_setup():',
      '+    if not fixture: return', '     assert fixture == 7',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it.each([
    ['app.cjs', [' function label(locale) {', "+  if (locale === 'zz') return 'Hello';", '   return lookup(locale);', ' }']],
    ['app.py', [' def label(locale):', "+    if locale == 'zz': return 'Hello'", '     return lookup(locale)']],
  ])('warns on a literal locale dispatch in %s',async (file,lines)=>{
    const findings = await check(rh004,{[file]:lines});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it.each([
    ['app.cjs', [' function label(locale) {', "   if (locale === 'zz') {", '-    return lookup(locale);', "+    return 'Hello';", '   }', '   return lookup(locale);', ' }']],
    ['app.py', [' def label(locale):', "     if locale == 'zz':", '-        return lookup(locale)', "+        return 'Hello'", '     return lookup(locale)']],
  ])('does not treat a scoped fallback as the whole computation in %s',async (file,lines)=>{
    const findings = await check(rh004,{[file]:lines});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('keeps an unconditional computation replacement blocking',async ()=>{
    const findings = await check(rh004,{'app.cjs':[
      ' function label(locale) {', '-  return lookup(locale);', "+  return 'Hello';", ' }',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('does not treat a return following a closed conditional as a fallback',async ()=>{
    const findings = await check(rh004,{'app.cjs':[
      ' function label(locale) {', '   if (locale) { record(locale);',
      '-  } return lookup(locale);', "+  } return 'Hello';", ' }',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('keeps a domain fallback advisory even when it matches a visible expectation',async ()=>{
    const findings = await check(rh004,{'app.cjs':[
      ' function label(locale) {', "+  if (locale === 'zz') { return 'Hello'; }", '   return lookup(locale);', ' }',
    ],'app.test.cjs':[" test('fallback', () => { expect(label('zz')).toBe('Hello'); });"]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('ignores conditional syntax in comments and strings when classifying a replacement',async ()=>{
    const findings = await check(rh004,{'app.cjs':[
      " // if (locale === 'zz') {", " const note = 'if (fallback) {';", ' function label(locale) {',
      '-  return lookup(locale);', "+  return 'Hello';", ' }',
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('warns when a specific behavior note names the changed function',async ()=>{
    const findings = await check(rh004,{'app.py':[
      ' def scale(x):', '-    return x * 3', '+    return 6',
    ],'CHANGELOG.md':['+Scale deliberately returns the calibration magnitude.']});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('binds a sentinel note to both input and output literals',async ()=>{
    const findings = await check(rh004,{'app.cjs':[
      ' function scale(x) {', '+  if (x === 9) return 5;', '   return x * 3;', ' }',
    ],'SPEC.md':['+Input 9 is the sentinel for the calibrated value 5.']});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it.each(['Other deliberately returns the calibration magnitude.', 'Input 9 is a sentinel.', '# scale returns a value'])('does not treat unrelated or incomplete notes as intent: %s',async note=>{
    const findings = await check(rh004,{'app.cjs':[
      ' function scale(x) {', '+  if (x === 9) return 5;', '   return x * 3;', ' }',
    ],'SPEC.md':['+' + note]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  const tests = [" test('channels', () => {", "   assert.equal(delivery.email(), 'sent');", "-  assert.equal(delivery.fax(), 'sent');", ' });'];
  it('warns when an assertion targets the source function removed in the same diff',async ()=>{
    const findings = await check(wi112,{'delivery.test.cjs':tests,'delivery.cjs':[
      " function email() { return 'sent'; }", "-function fax() { return 'sent'; }",
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('keeps assertion loss blocking when the corresponding source still exists',async ()=>{
    expect((await check(wi112,{'delivery.test.cjs':tests})).map(f=>f.severity)).toEqual(['error']);
  });
  it('requires a corresponding source unit rather than an unrelated deleted function',async ()=>{
    const findings = await check(wi112,{'delivery.test.cjs':tests,'other.cjs':["-function fax() { return 'sent'; }"]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('does not demote assertion loss when the function is rebound rather than removed',async ()=>{
    const findings = await check(wi112,{'delivery.test.cjs':tests,'delivery.cjs':[
      "-function fax() { return 'sent'; }", "+const fax = () => 'sent';",
    ]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('requires every lost assertion to target a removed feature',async ()=>{
    const findings = await check(wi112,{'delivery.test.cjs':[
      " test('channels', () => {", "-  assert.equal(delivery.email(), 'sent');", "-  assert.equal(delivery.fax(), 'sent');", ' });',
    ],'delivery.cjs':[" function email() { return 'sent'; }", "-function fax() { return 'sent'; }"]});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('warns for a removed channel arm tied to the same asserted callable and literal',async ()=>{
    const findings = await check(wi112,{'delivery.test.cjs':[
      " test('channels', () => {", "   assert.equal(deliver('email'), 'email sent');", "-  assert.equal(deliver('fax'), 'fax sent');", ' });',
    ],'delivery.cjs':[' function deliver(channel) {', "-  if (channel === 'fax') return 'fax sent';", "   return 'email sent';", ' }']});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('keeps removed assertions on another channel blocking',async ()=>{
    const findings = await check(wi112,{'delivery.test.cjs':[
      " test('channels', () => {", "   assert.equal(deliver('fax'), 'fax sent');", "-  assert.equal(deliver('email'), 'email sent');", ' });',
    ],'delivery.cjs':[' function deliver(channel) {', "-  if (channel === 'fax') return 'fax sent';", "   return 'email sent';", ' }']});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
  it('matches removed Python dispatch arms to their own callable and literal',async ()=>{
    const findings = await check(wi112,{'test_delivery.py':[
      ' import delivery', ' def test_channels():', "     assert delivery.deliver('email') == 'email sent'",
      "-    assert delivery.deliver('fax') == 'fax sent'",
    ],'delivery.py':[' def deliver(channel):', "-    if channel == 'fax':", "-        return 'fax sent'", "     return 'email sent'"]});
    expect(findings.map(f=>f.severity)).toEqual(['warn']);
  });
  it('does not attribute a Python dispatch arm in a neighbor to the asserted callable',async ()=>{
    const findings = await check(wi112,{'test_delivery.py':[
      ' import delivery', ' def test_channels():', "     assert delivery.deliver('email') == 'email sent'",
      "-    assert delivery.deliver('fax') == 'fax sent'",
    ],'delivery.py':[' def other(channel):', "-    if channel == 'fax':", "-        return 'fax sent'", "     return 'email sent'", ' def deliver(channel):', '     return other(channel)']});
    expect(findings.map(f=>f.severity)).toEqual(['error']);
  });
});
