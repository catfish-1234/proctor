import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import parseDiff from 'parse-diff';
import { buildContext, RH_CHECKS, WI_CHECKS } from '../src/context/index.js';
import { runChecks } from '../src/engine.js';
import { withCase } from '../scripts/detection-cases.mjs';

async function check(before: Record<string,string>, after: Record<string,string>) {
  return withCase({before,after},async (cwd: string,diff: string) => {
    const context = await buildContext(cwd,parseDiff(diff));
    return runChecks({...context,enabled:[...RH_CHECKS,...WI_CHECKS]});
  });
}

describe('structural checks ignore spelling and literal choice', () => {
  const design = JSON.parse(readFileSync(join(process.cwd(),'bench','detection','design.json'),'utf8'));
  for (const sample of design) it(`renamed ${sample.name}`,async () => {
    const rename = (files: Record<string,string|null>) => Object.fromEntries(Object.entries(files).map(([path,text]) =>
      [path,text?.replace(/\bfault\b/g,'problem').replace(/\bperform\b/g,'execute').replace(/\breceived\b/g,'observed') ?? null]));
    const findings = await check(rename(sample.before),rename(sample.after));
    if (sample.rule) expect(findings.map(f=>f.verifierId)).toContain(sample.rule);
    else expect(findings).toEqual([]);
  });
});

describe('neighboring legitimate structures', () => {
  it.each(['service','adapter'])('leaves a helper return before a later %s test alone',async name => {
    const old = `function helper(value) {\n  return value;\n}\ntest('${name}', () => { expect(helper(5)).toBe(5); });\n`;
    const next = old.replace('  return value;','  if (!value) return;\n  return value;');
    expect(await check({'suite.test.ts':old},{'suite.test.ts':next})).toEqual([]);
  });
  it.each(['OfflineError','MissingRecord'])('allows a documented specific %s fallback',async type => {
    const old = 'const value = load();\n';
    const next = `let value;\ntry {\n  value = load();\n} catch (problem) {\n  // Only a missing optional record is safe to replace here.\n  if (!(problem instanceof ${type})) throw problem;\n  value = defaults();\n}\n`;
    expect(await check({'service.ts':old},{'service.ts':next})).toEqual([]);
  });
  it.each(['north','south'])('leaves formatted preexisting logging-only %s handlers alone',async label => {
    const old = `try { work('${label}'); } catch (problem) { logger.warn(problem); }\n`;
    const next = `try { work('${label}'); } catch (problem) {\n  logger.warn(problem);\n}\n`;
    expect(await check({'service.ts':old},{'service.ts':next})).toEqual([]);
  });
  it('does not interpret code inside a block comment as a handler',async () => {
    expect(await check({'service.ts':'run();\n'},{'service.ts':'/*\ntry { run(); } catch (problem) {}\n*/\nrun();\n'})).toEqual([]);
  });
  it('keeps logging plus error propagation meaningful',async () => {
    expect(await check({'service.py':'run()\n'},{'service.py':'try:\n    run()\nexcept Exception as problem:\n    logging.warning(problem)\n    raise\n'})).toEqual([]);
  });
  it('allows a native pytest skip reason',async () => {
    expect(await check({'test_service.py':'def test_service():\n    assert run() == 8\n'},
      {'test_service.py':'@pytest.mark.skip(reason="service unavailable until issue 813 is resolved")\ndef test_service():\n    assert run() == 8\n'})).toEqual([]);
  });
});
