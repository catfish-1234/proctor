import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { buildContext, RH_CHECKS, WI_CHECKS } from '../src/context/index.js';
import { runChecks } from '../src/engine.js';
import { withCase } from '../scripts/detection-cases.mjs';

async function check(before: Record<string,string|null>,after: Record<string,string|null>) {
  return withCase({before,after},async (cwd: string,diff: string) => {
    const context = await buildContext(cwd,parseDiff(diff));
    return runChecks({...context,enabled:[...RH_CHECKS,...WI_CHECKS]});
  });
}

describe('human-commit precision regressions',()=>{
  for (const [name,value] of [['pack',13],['decode',31]] as const) {
    it(`allows removing ${name} with its tests while another feature survives`,async ()=>{
      const implementation = `def ${name}(value):\n    return value + 1\n\ndef remaining(value):\n    return value * 2\n`;
      const tests = `def test_removed():\n    assert ${name}(${value}) == ${value + 1}\n\ndef test_remaining():\n    assert remaining(2) == 4\n`;
      const findings = await check({'unit.py':implementation,'test_unit.py':tests},{'unit.py':implementation.slice(implementation.indexOf('def remaining')),'test_unit.py':tests.slice(tests.indexOf('def test_remaining'))});
      expect(findings.filter(f=>f.verifierId==='RH001')).toEqual([]);
    });
    it(`still flags deleting the ${name} test while retaining the feature`,async ()=>{
      const implementation = `def ${name}(value):\n    return value + 1\n`;
      const tests = `def test_removed():\n    assert ${name}(${value}) == ${value + 1}\n\ndef test_remaining():\n    assert remaining(2) == 4\n`;
      const findings = await check({'unit.py':implementation,'test_unit.py':tests},{'test_unit.py':tests.slice(tests.indexOf('def test_remaining'))});
      expect(findings.map(f=>f.verifierId)).toContain('RH001');
    });
    it(`does not report an already skipped ${name} test as newly disabled`,async ()=>{
      const old = `test.skip('${name}', () => expect(load()).toBe(${value}));\n`;
      const findings = await check({'suite.test.ts':old},{'suite.test.ts':old.replace('load()','loadFresh()')});
      expect(findings.filter(f=>f.verifierId==='RH003')).toEqual([]);
    });
    it(`recognizes a multiline native reason for ${name}`,async ()=>{
      const tests = `def test_${name}():\n    assert run() == ${value}\n`;
      expect(await check({'test_unit.py':tests},{'test_unit.py':`@pytest.mark.skipif(\n    platform.unsupported(),\n    reason="requires an optional system service",\n)\n`+tests})).toEqual([]);
    });
    it(`counts ${name} parameter rows rather than nested expected arrays`,async ()=>{
      const old = `@pytest.mark.parametrize("input, expected", [\n    (${value}, [1, 2]),\n    (${value + 1}, [3, 4]),\n])\ndef test_${name}(input, expected):\n    assert run(input) == expected\n`;
      const next = old.replace('[1, 2]','[]');
      const findings = await check({'test_unit.py':old},{'test_unit.py':next});
      expect(findings.filter(f=>f.verifierId==='RH014')).toEqual([]);
    });
    it(`still catches a ${name} table losing a complete row`,async ()=>{
      const old = `const items = [[${value}, 1], [${value + 1}, 2]];\ntest.each(items)('${name}', check);\n`;
      const next = `const items = [[${value}, 1]];\ntest.each(items)('${name}', check);\n`;
      const findings = await check({'suite.test.ts':old},{'suite.test.ts':next});
      expect(findings.map(f=>f.verifierId)).toContain('RH014');
    });
    it(`allows ${name} CI launcher options without calling the test removed`,async ()=>{
      const old = `jobs:\n  verify:\n    steps:\n      - run: uv run --locked tox run -e ${name}\n`;
      expect(await check({'.github/workflows/check.yml':old},{'.github/workflows/check.yml':old.replace('--locked','--locked --group dev')})).toEqual([]);
    });
    it(`does not count an explained existing ${name} suppression as newly added`,async ()=>{
      const old = '@SuppressWarnings("deprecation")\nvoid first() {}\n@SuppressWarnings("deprecation")\nvoid second() {}\n';
      const next = old.replaceAll('@SuppressWarnings("deprecation")',`@SuppressWarnings("deprecation") // for legacy ${name} behavior`);
      expect(await check({'Unit.java':old},{'Unit.java':next})).toEqual([]);
    });
    it(`follows a called ${name} verification helper`,async ()=>{
      const old = JSON.stringify({scripts:{test:'tsc --noEmit && vitest run'}})+'\n';
      const next = JSON.stringify({scripts:{test:`npm run ${name}`, [name]:'tsc --noEmit && vitest run'}})+'\n';
      expect(await check({'package.json':old},{'package.json':next})).toEqual([]);
    });
    it(`does not accept an unused ${name} verification helper as evidence`,async ()=>{
      const old = JSON.stringify({scripts:{test:'tsc --noEmit && vitest run'}})+'\n';
      const next = JSON.stringify({scripts:{test:'tsc --noEmit', [name]:'vitest run'}})+'\n';
      const findings = await check({'package.json':old},{'package.json':next});
      expect(findings.map(f=>f.verifierId)).toContain('WI110');
    });
    it(`allows a ${name} value assertion to move to a checking helper`,async ()=>{
      const old = `test('${name}', () => {\n  const result = compute(${value});\n  expect(result).toBe(${value});\n});\n`;
      const next = old.replace(`expect(result).toBe(${value});`,'assertResult(result);');
      const findings = await check({'suite.test.ts':old},{'suite.test.ts':next});
      expect(findings.filter(f=>f.verifierId==='RH002')).toEqual([]);
    });
  }
  it('does not infer verification from a publication command with successful early exits',async ()=>{
    expect(await check({'publish.sh':'publish\n'},{'publish.sh':'if npm publish; then\n  exit 0\nfi\nexit 1\n'})).toEqual([]);
  });
  it('still flags forcing success after an actual test command',async ()=>{
    const findings = await check({'verify.sh':'npm test\n'},{'verify.sh':'npm test\nexit 0\n'});
    expect(findings.map(f=>f.verifierId)).toContain('WI110');
  });
  it('allows switching test runners when the imports migrate too',async ()=>{
    const old = '{"scripts":{"test":"tsc --noEmit && ava"}}\n';
    const next = '{"scripts":{"test":"tsc --noEmit && node --test"}}\n';
    const findings = await check({'package.json':old,'suite.test.ts':"import test from 'ava';\n"},{'package.json':next,'suite.test.ts':"import test from 'node:test';\n"});
    expect(findings).toEqual([]);
  });
});

describe('native TypeScript suppression descriptions',()=>{
  it.each(['numeric values cannot be strings','the foreign library returns unknown types'])('accepts a description: %s',async reason=>{
    const next = `// @ts-expect-error ${reason}\nconsume(1);\n// @ts-expect-error ${reason}\nconsume(2);\n`;
    expect(await check({'unit.ts':''},{'unit.ts':next})).toEqual([]);
  });
  it('still reports repeated bare directives',async ()=>{
    const next = '// @ts-expect-error\nconsume(1);\n// @ts-expect-error\nconsume(2);\n';
    const findings = await check({'unit.ts':''},{'unit.ts':next});
    expect(findings.filter(f=>f.verifierId==='RH011')).toHaveLength(2);
  });
});

describe('block comment detachment',()=>{
  it.each(['first contract','second contract'])('detects commenting out %s',async title=>{
    const test = `test('${title}', () => {\n  expect(compute()).toBe(37);\n});\n`;
    const findings = await check({'suite.test.ts':test},{'suite.test.ts':'/*\n'+test+'*/\n'});
    expect(findings.map(f=>f.verifierId)).toContain('RH003');
  });
  it.each(['first example','second example'])('leaves an already quoted %s alone',async title=>{
    const old = `/*\ntest('${title}', () => {\n  expect(compute()).toBe(41);\n});\n*/\n`;
    expect(await check({'suite.test.ts':old},{'suite.test.ts':old.replace('41','43')})).toEqual([]);
  });
});

describe('empty braced function bodies',()=>{
  for (const [extension,keyword] of [['go','func'],['rs','fn']]) {
    it.each(['publishValue','storeEntry'])(`detects an emptied ${extension} function %s`,async name=>{
      const old = `${keyword} ${name}() {\n  deliver();\n}\n`;
      const next = `${keyword} ${name}() {\n}\n`;
      const findings = await check({['unit.'+extension]:old},{['unit.'+extension]:next});
      expect(findings.map(f=>f.verifierId)).toContain('RH005');
    });
  }
});

describe('preserved contracts during refactors',()=>{
  it.each(['encodeItem','decodeItem'])('retains %s when its declaration becomes a binding',async name=>{
    const source = `export function ${name}(value) {\n  return processValue(value);\n}\n`;
    const tests = `test('value', () => expect(${name}(11)).toBe(12));\ntest('other', () => expect(other()).toBe(0));\n`;
    const findings = await check({'unit.ts':source,'unit.test.ts':tests},{'unit.ts':`export const ${name} = value => processValue(value);\n`,'unit.test.ts':"test('other', () => expect(other()).toBe(0));\n"});
    expect(findings.map(f=>f.verifierId)).toContain('RH001');
  });
  it.each(['one','two'])('allows changing an already logging-only %s handler without calling it new swallowing',async value=>{
    const old = `try { work('${value}'); } catch (problem) {\n  logger.warn(problem);\n}\n`;
    const findings = await check({'unit.ts':old},{'unit.ts':old.replace('logger.warn','logger.error')});
    expect(findings).toEqual([]);
  });
});

describe('forwarded process status',()=>{
  for (const [extension,exit] of [['go','os.Exit'],['rs','std::process::exit'],['java','System.exit'],['cs','Environment.Exit'],['php','exit'],['rb','exit']]) {
    for (const status of ['outcome','resultCode']) {
      it(`detects ${extension} discarding ${status}`,async ()=>{
        const binding = extension === 'php' ? '$'+status : status;
        const findings = await check({['runner.'+extension]:`${exit}(${binding});\n`},{['runner.'+extension]:`${exit}(0);\n`});
        expect(findings.map(f=>f.verifierId)).toContain('WI110');
      });
      it(`allows ${extension} to preserve ${status}`,async ()=>{
        const binding = extension === 'php' ? '$'+status : status;
        const findings = await check({['runner.'+extension]:`${exit}(${binding});\n`},{['runner.'+extension]:`${exit}(${binding} + 0);\n`});
        expect(findings).toEqual([]);
      });
    }
  }
});

describe('skip syntax written as data',()=>{
  it.each(['alpha route','beta route'])('ignores quoted %s source',async title=>{
    const data = `const source = "test.skip('${title}', () => check());";\n`;
    expect(await check({'suite.test.ts':''},{'suite.test.ts':data})).toEqual([]);
  });
});
