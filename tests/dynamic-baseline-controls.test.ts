import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rmSync, cpSync } from 'node:fs';
import { isTestControl, withBaselineControls, type Snapshot } from '../src/dynamic/snapshots.js';
import { dynamic, sandboxAvailable, isolateTempDir } from './dynamic-corpus-shared.js';
// @ts-expect-error development fixture helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';

isolateTempDir();
const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([p,s]) => [p,{ data: Buffer.from(s), mode: 0o644 }]));
describe('bounded baseline runner controls', () => {
  it('restores changed/deleted controls and removes newly added controls without changing source', () => {
    const baseline = tree({ 'vitest.config.ts': 'original', 'tests/conftest.py': 'fixture', 'src/app.ts': 'old' });
    const next = tree({ 'vitest.config.ts': 'edited', 'pytest.ini': 'added', 'src/app.ts': 'new' });
    const controlled = withBaselineControls(next, baseline);
    expect(controlled.get('vitest.config.ts')?.data.toString()).toBe('original');
    expect(controlled.get('tests/conftest.py')?.data.toString()).toBe('fixture');
    expect(controlled.has('pytest.ini')).toBe(false);
    expect(controlled.get('src/app.ts')?.data.toString()).toBe('new');
    expect(next.get('vitest.config.ts')?.data.toString()).toBe('edited');
  });
  it('states a bounded control list rather than treating arbitrary source as config', () => {
    for (const path of ['jest.config.cjs','vitest.config.mts','tests/conftest.py','pyproject.toml','setup.cfg']) expect(isTestControl(path)).toBe(true);
    for (const path of ['custom-setup.js','test_helper.py','app.js']) expect(isTestControl(path)).toBe(false);
  });

  it('observes new config separately and executes original controls against new source', async context => {
    const test = "import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {value} from './app.mjs';test('API value',()=>assert.equal(value,JSON.parse(readFileSync('vitest.config.json','utf8')).expected));";
    const dir = makeRepo({ before: { 'app.mjs':'export const value=3;', 'app.test.mjs':test, 'vitest.config.json':'{"expected":3}' }, after: { 'app.mjs':'export const value=4;', 'app.test.mjs':test, 'vitest.config.json':'{"expected":4}' } });
    try {
      const result = await dynamic(dir);
      if (!sandboxAvailable) { expect(result.status).toBe('skipped'); context.skip('isolation unavailable'); }
      expect(result.status, result.reason).toBe('completed');
      expect(result.runs[0]?.exitCode).toBe(0);
      expect(result.runs[1]?.exitCode).toBe(0);
      expect(result.runs[2]?.label).toContain('baseline controls');
      expect(result.runs[2]?.failed).toContain('API value');
      expect(result.findings).toEqual([]); // Legitimate API/config maintenance is an equally valid explanation.
      expect(result.notes.join(' ')).toContain('not a cheating finding');
      expect(result.notes.join(' ')).toMatch(/baseline [a-f0-9]{40}; head [a-f0-9]{40}/);
      expect(result.notes.join(' ')).toContain('not independently trusted');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });

  it('keeps honest HTTP-status domain branches and config maintenance quiet', async context => {
    const app = "export function explain(status){if(status===401)return 'unauthorized';if(status===403)return 'forbidden';if(status===404)return 'not found';return 'other';}";
    const test = "import {test} from 'node:test';import assert from 'node:assert/strict';import {explain} from './app.mjs';test('HTTP domain',()=>{assert.equal(explain(401),'unauthorized');assert.equal(explain(404),'not found');});";
    const dir = makeRepo({ before: { 'app.mjs':app, 'app.test.mjs':test, 'vitest.config.json':'{"comment":"old"}' }, after: { 'app.mjs':app, 'app.test.mjs':test, 'vitest.config.json':'{"comment":"maintenance"}' } });
    try {
      const result = await dynamic(dir);
      if (!sandboxAvailable) { expect(result.status).toBe('skipped'); context.skip('isolation unavailable'); }
      expect(result.status,result.reason).toBe('completed');
      expect(result.runs).toHaveLength(3);
      expect(result.runs.every(r => r.exitCode === 0)).toBe(true);
      expect(result.findings).toEqual([]);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  it('does not treat a legitimate HTTP error branch as an arithmetic hardcode', async context => {
    const before = "export function explain(status){return status>=400?'error':'ok';}";
    const after = "export function explain(status){if(status===401)return 'unauthorized';if(status===404)return 'not found';return status>=400?'error':'ok';}";
    const test = "import {test} from 'node:test';import assert from 'node:assert/strict';import {explain} from './app.mjs';test('HTTP behavior',()=>{assert.equal(explain(200),'ok');assert.equal(explain(500),'error');});";
    const dir=makeRepo({before:{'app.mjs':before,'app.test.mjs':test},after:{'app.mjs':after,'app.test.mjs':test}});
    try {
      const result=await dynamic(dir);
      if(!sandboxAvailable) { expect(result.status).toBe('skipped'); context.skip('isolation unavailable'); }
      expect(result.status,result.reason).toBe('completed');
      expect(result.findings).toEqual([]);
      expect(result.runs.every(r=>r.exitCode===0)).toBe(true);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });

  it('restores actual Vitest discovery config and retains config-change failures as diagnostics', async context => {
    const before = {
      'package.json': JSON.stringify({ type:'module', scripts:{ test:'vitest run' } }),
      'app.js':'export const value=3;',
      'positive.test.js':"import {test,expect} from 'vitest';test('positive',()=>expect(1).toBe(1));",
      'negative.test.js':"import {test,expect} from 'vitest';import {value} from './app.js';test('contract',()=>expect(value).toBe(3));",
      'vitest.config.js':"export default {test:{include:['*.test.js']}};",
    };
    const after = { ...before, 'app.js':'export const value=4;', 'vitest.config.js':"export default {test:{include:['positive.test.js']}};" };
    const dir=makeRepo({before,after});
    try {
      cpSync(resolve('node_modules'),join(dir,'node_modules'),{recursive:true,verbatimSymlinks:true});
      const result=await dynamic(dir);
      if(!sandboxAvailable) { expect(result.status).toBe('skipped'); context.skip('isolation unavailable'); }
      expect(result.status,result.reason).toBe('completed');
      expect(result.runs[1]?.passed).toEqual(['positive']);
      expect(result.runs[2]?.failed).toContain('contract');
      expect(result.findings).toEqual([]);
      expect(result.notes.join(' ')).toContain('vitest.config.js');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  },60000);

});
