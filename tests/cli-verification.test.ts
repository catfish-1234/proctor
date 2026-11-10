import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { sandboxAvailable, isolateTempDir } from './dynamic-corpus-shared.js';
import { readBudget, writeBudget } from '../src/hooks/stop-hook.js';
import { readUnresolved, recordUnresolved } from '../src/hooks/unresolved.js';
// @ts-expect-error development fixture helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';
const CLI=resolve('dist/cli.js');
isolateTempDir();
const invoke=(dir:string,...args:string[])=>spawnSync(process.execPath,[CLI,'check',...args],{cwd:dir,encoding:'utf8',timeout:65000});
describe('CLI requested verification state',()=>{
  it('keeps old --json array compatible but withholds honest badge for unsupported execution',()=>{
    const dir=makeRepo({before:{'app.rs':'fn x()->i32{1}'},after:{'app.rs':'fn x()->i32{2}'}});
    try{
      const old=invoke(dir,'--dynamic','--json');expect(old.status).toBe(0);expect(JSON.parse(old.stdout)).toEqual([]);expect(old.stderr).toContain('verification: incomplete');expect(old.stderr).not.toContain('honest pass');
      const required=invoke(dir,'--require-dynamic','--result-json','--ci');expect(required.status).toBe(3);
      const result=JSON.parse(required.stdout);expect(result.status).toBe('incomplete');expect(result.findings).toEqual([]);expect(result.checks.dynamic.status).toBe('skipped');expect(result.requiredDynamic).toBe(true);
      const normal=invoke(dir,'--json');expect(normal.status).toBe(0);expect(JSON.parse(normal.stdout)).toEqual([]);expect(normal.stderr).toContain('honest pass');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('preserves failed baseline controls as machine evidence and requires review rather than cheating',context=>{
    if(!sandboxAvailable)context.skip('Linux isolation unavailable');
    const test="import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {value} from './app.mjs';test('contract',()=>assert.equal(value,JSON.parse(readFileSync('vitest.config.json','utf8')).expected));";
    const dir=makeRepo({before:{'app.mjs':'export const value=3;','app.test.mjs':test,'vitest.config.json':'{"expected":3}'},after:{'app.mjs':'export const value=4;','app.test.mjs':test,'vitest.config.json':'{"expected":4}'}});
    try{
      const r=invoke(dir,'--require-dynamic','--result-json','--rules','RH014');expect(r.status,r.stderr).toBe(3);
      const result=JSON.parse(r.stdout);expect(result.status).toBe('review-required');expect(result.findings).toEqual([]);expect(result.checks.dynamic.runs[2].failed).toEqual(['contract']);expect(result.checks.dynamic.runs[2].command).toBeTruthy();expect(r.stderr).not.toContain('honest pass');
      const array=invoke(dir,'--dynamic','--json','--rules','RH014');expect(array.status).toBe(0);expect(JSON.parse(array.stdout)).toEqual([]);expect(array.stderr).not.toContain('honest pass');
      const requested=invoke(dir,'--dynamic','--require-requested-dynamic','--result-json','--rules','RH014');expect(requested.status).toBe(3);expect(JSON.parse(requested.stdout).status).toBe('review-required');
      const markdown=join(dir,'summary.md');const sarif=invoke(dir,'--require-dynamic','--sarif','--rules','RH014','--markdown',markdown);expect(sarif.status).toBe(3);expect(JSON.parse(sarif.stdout).runs[0].properties.verification.status).toBe('review-required');expect(readFileSync(markdown,'utf8')).toContain('review-required');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('allows an honest executable fix with a red baseline and records exact local refs',context=>{
    if(!sandboxAvailable)context.skip('Linux isolation unavailable');
    const test="import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from './app.mjs';test('fixed',()=>assert.equal(value,4));";
    const dir=makeRepo({before:{'app.mjs':'export const value=3;','app.test.mjs':test},after:{'app.mjs':'export const value=4;','app.test.mjs':test}});
    try{
      const r=invoke(dir,'--require-dynamic','--result-json','--rules','RH014');expect(r.status,r.stderr).toBe(0);const result=JSON.parse(r.stdout);expect(result.status).toBe('no-findings');expect(result.verification.status).toBe('complete');expect(result.checks.dynamic.notes.join(' ')).toContain('not independently trusted');expect(result.checks.dynamic.snapshots.baseCommit).toMatch(/^[a-f0-9]{40}$/);expect(result.checks.dynamic.snapshots.overlay).toBe('working-tree');expect(result.checks.dynamic.runs[0].failed).toEqual(['fixed']);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('rejects contradictory reporter output as incomplete with no clean badge or cheating finding',context=>{
    if(!sandboxAvailable)context.skip('Linux isolation unavailable');
    const app="import {test} from 'node:test';test('same',()=>{});test('same',()=>{});";
    const dir=makeRepo({before:{'app.test.mjs':app,'readme.md':'old'},after:{'app.test.mjs':app,'readme.md':'new'}});
    try{const r=invoke(dir,'--require-dynamic','--result-json');expect(r.status).toBe(3);const result=JSON.parse(r.stdout);expect(result.status).toBe('incomplete');expect(result.findings).toEqual([]);expect(result.checks.dynamic.reason).toContain('duplicate');expect(r.stderr).not.toContain('honest pass');}finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('keeps bounded timeout distinct from cheating',()=>{
    const dir=makeRepo({before:{'app.test.mjs':"import {test} from 'node:test';test('wait',()=>{for(;;){}});"},after:{'app.test.mjs':"import {test} from 'node:test';test('wait',()=>{for(;;){}});"}});
    try{const r=invoke(dir,'--require-dynamic','--dynamic-timeout','1','--result-json');expect(r.status).toBe(3);expect(JSON.parse(r.stdout).status).toBe('incomplete');expect(r.stderr).not.toContain('honest pass');}finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('honors committed dynamic opt-in and surfaces UNVERIFIED at the Stop hook instead of a false clean',()=>{
    const dir=makeRepo({before:{'app.rs':'fn x()->i32{1}','proctor.config.json':'{"dynamic":true}'},after:{'app.rs':'fn x()->i32{2}','proctor.config.json':'{"dynamic":true}'}});
    try{const r=invoke(dir,'--result-json');expect(r.status).toBe(0);expect(JSON.parse(r.stdout).status).toBe('incomplete');const stop=spawnSync(process.execPath,[CLI,'stop-hook'],{cwd:dir,input:JSON.stringify({cwd:dir}),encoding:'utf8'});expect(stop.status).toBe(0);expect(stop.stdout).toBe('');expect(stop.stderr).toContain('UNVERIFIED');expect(stop.stderr).toContain('prior budget retained');const badge=spawnSync(process.execPath,[CLI,'badge','--url'],{cwd:dir,encoding:'utf8'});expect(badge.status).toBe(0);expect(badge.stdout).toContain('incomplete');expect(badge.stdout).not.toContain('honest_pass');}finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('requires requested dynamic evidence only when dynamic is on, without enabling it',()=>{
    const dir=makeRepo({before:{'app.rs':'fn x()->i32{1}'},after:{'app.rs':'fn x()->i32{2}'}});
    try{
      const plain=invoke(dir,'--require-requested-dynamic','--result-json');expect(plain.status,plain.stderr).toBe(0);const parsed=JSON.parse(plain.stdout);expect(parsed.status).toBe('no-findings');expect(parsed.checks.dynamic.status).toBe('not-requested');expect(parsed.requiredDynamic).toBe(false);expect(plain.stderr).not.toContain('dynamic:');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('exits 3, not a finding, when requested dynamic evidence cannot complete',()=>{
    const dir=makeRepo({before:{'app.rs':'fn x()->i32{1}','proctor.config.json':'{"dynamic":true}'},after:{'app.rs':'fn x()->i32{2}','proctor.config.json':'{"dynamic":true}'}});
    try{
      const r=invoke(dir,'--require-requested-dynamic','--result-json');expect(r.status,r.stderr).toBe(3);const parsed=JSON.parse(r.stdout);expect(parsed.status).toBe('incomplete');expect(parsed.requiredDynamic).toBe(true);expect(parsed.findings).toEqual([]);
      const optional=invoke(dir,'--result-json');expect(optional.status).toBe(0);expect(JSON.parse(optional.stdout).requiredDynamic).toBe(false);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('retains the Stop block budget and records nothing when requested dynamic evidence cannot complete',()=>{
    const dir=makeRepo({before:{'app.rs':'fn x()->i32{1}','proctor.config.json':'{"dynamic":true}'},after:{'app.rs':'fn x()->i32{2}','proctor.config.json':'{"dynamic":true}'}});
    try{
      expect(writeBudget('dynconv',{blocks:2})).toBe(true);
      const stop=spawnSync(process.execPath,[CLI,'stop-hook','--format','antigravity'],{cwd:dir,input:JSON.stringify({cwd:dir,workspacePaths:[dir],conversationId:'dynconv',executionNum:3}),encoding:'utf8'});
      expect(stop.status).toBe(0);expect(stop.stdout).toBe('');expect(stop.stderr).toContain('UNVERIFIED');
      expect(readBudget('dynconv')).toEqual({state:'known',value:{blocks:2}});
      expect(readUnresolved(dir).state).toBe('none');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('clears the Stop budget only on a complete requested verification',context=>{
    if(!sandboxAvailable)context.skip('Linux isolation unavailable');
    const test="import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from './app.mjs';test('fixed',()=>assert.equal(value,4));";
    const dir=makeRepo({before:{'app.mjs':'export const value=3;','app.test.mjs':test,'proctor.config.json':'{"dynamic":true}'},after:{'app.mjs':'export const value=4;','app.test.mjs':test,'proctor.config.json':'{"dynamic":true}'}});
    try{
      expect(writeBudget('dynclear',{blocks:1})).toBe(true);
      const stop=spawnSync(process.execPath,[CLI,'stop-hook','--format','antigravity'],{cwd:dir,input:JSON.stringify({cwd:dir,workspacePaths:[dir],conversationId:'dynclear',executionNum:2}),encoding:'utf8',timeout:120000});
      expect(stop.status,stop.stderr).toBe(0);expect(stop.stderr).not.toContain('UNVERIFIED');
      expect(readBudget('dynclear')).toEqual({state:'known',value:{blocks:0}});
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('keeps the unresolved record when requested dynamic evidence cannot complete',()=>{
    const dir=makeRepo({before:{'app.rs':'fn x()->i32{1}','proctor.config.json':'{"dynamic":true}'},after:{'app.rs':'fn x()->i32{2}','proctor.config.json':'{"dynamic":true}'}});
    try{
      recordUnresolved({cwd:dir,source:'test',conversationId:'c1',findings:'[RH001] deleted',blockBudget:5});
      const r=spawnSync(process.execPath,[CLI,'unresolved','--verify'],{cwd:dir,encoding:'utf8',timeout:120000});
      expect(r.status,r.stderr).toBe(3);expect(r.stderr).toContain('could NOT verify');expect(readUnresolved(dir).state).toBe('unresolved');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('clears the unresolved record on a complete requested verification',context=>{
    if(!sandboxAvailable)context.skip('Linux isolation unavailable');
    const test="import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from './app.mjs';test('fixed',()=>assert.equal(value,4));";
    const dir=makeRepo({before:{'app.mjs':'export const value=3;','app.test.mjs':test,'proctor.config.json':'{"dynamic":true}'},after:{'app.mjs':'export const value=4;','app.test.mjs':test,'proctor.config.json':'{"dynamic":true}'}});
    try{
      recordUnresolved({cwd:dir,source:'test',conversationId:'c2',findings:'[RH001] deleted',blockBudget:5});
      // A real clear happens after the fix is committed: the working-tree run is then a vacuous
      // clean check, and the baseline run observes the committed fix with complete dynamic evidence.
      spawnSync('git',['add','.'],{cwd:dir});spawnSync('git',['commit','-qm','fix'],{cwd:dir});
      const r=spawnSync(process.execPath,[CLI,'unresolved','--verify'],{cwd:dir,encoding:'utf8',timeout:180000});
      expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('cleared');expect(readUnresolved(dir).state).toBe('none');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('rejects conflicting output flags rather than mixing schemas',()=>{
    const r=spawnSync(process.execPath,[CLI,'check','--json','--result-json'],{encoding:'utf8'});expect(r.status).toBe(3);expect(r.stdout).toBe('');
    const explain=spawnSync(process.execPath,[CLI,'check','--explain','RH001','--require-requested-dynamic'],{encoding:'utf8'});expect(explain.status).toBe(3);
  });
});
