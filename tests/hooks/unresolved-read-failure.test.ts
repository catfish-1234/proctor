import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordUnresolved, readUnresolved } from '../../src/hooks/unresolved.js';
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});
afterEach(()=>vi.restoreAllMocks());
describe('unresolved record read failures',()=>{
  it('does not reinterpret failure of a redundant Git path lookup as missing history',()=>{
    const dir=mkdtempSync(join(tmpdir(),'proctor-unresolved-git-'));
    try{
      expect(spawnSync('git',['init','-q'],{cwd:dir}).status).toBe(0);
      const input={cwd:dir,source:'test',findings:'original',blockBudget:1};
      const path=recordUnresolved(input)!;
      const actual=vi.mocked(spawnSync).getMockImplementation()!;
      let resolutions=0;
      vi.mocked(spawnSync).mockImplementation(((command:unknown,args:unknown[],...rest:unknown[])=>{
        if(command==='git'&&args.includes('--absolute-git-dir')&&++resolutions===2)return {status:1,stdout:'',stderr:'transient Git failure'};
        return (actual as Function)(command,args,...rest);
      }) as typeof spawnSync);
      expect(recordUnresolved({...input,findings:'next'})).toBe(path);
      vi.mocked(spawnSync).mockImplementation(actual);
      const record=readUnresolved(dir);if(record.state!=='unresolved')throw Error('missing record');
      expect(record.record.occurrences).toBe(2);expect(record.record.originalFindings).toBe('original');expect(resolutions).toBe(1);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('keeps malformed prior history rather than silently resetting its baseline',()=>{
    const dir=mkdtempSync(join(tmpdir(),'proctor-unresolved-malformed-'));
    try{
      expect(spawnSync('git',['init','-q'],{cwd:dir}).status).toBe(0);
      const input={cwd:dir,source:'test',findings:'original',blockBudget:1};
      const path=recordUnresolved(input)!;writeFileSync(path,'{broken');
      expect(recordUnresolved({...input,findings:'next'})).toBeUndefined();
      expect(readFileSync(path,'utf8')).toBe('{broken');
      expect(readUnresolved(dir).state).toBe('corrupt');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('never overwrites known history when reading the existing record transiently fails',()=>{
    const dir=mkdtempSync(join(tmpdir(),'proctor-unresolved-read-'));
    try{
      expect(spawnSync('git',['init','-q'],{cwd:dir}).status).toBe(0);
      const input={cwd:dir,source:'test',findings:'original',blockBudget:1};
      const path=recordUnresolved(input)!;expect(path).toBeTruthy();
      const original=readFileSync(path,'utf8');
      const actual=vi.mocked(readFileSync).getMockImplementation()!;
      vi.mocked(readFileSync).mockImplementation(((file:unknown,...args:unknown[])=>{
        if(file===path)throw Object.assign(new Error('scanner sharing violation'),{code:'EBUSY'});
        return (actual as Function)(file,...args);
      }) as typeof readFileSync);
      expect(recordUnresolved({...input,findings:'next'})).toBeUndefined();
      vi.mocked(readFileSync).mockImplementation(actual);
      expect(readFileSync(path,'utf8')).toBe(original);
      expect(recordUnresolved({...input,findings:'after recovery'})).toBe(path);
      const record=readUnresolved(dir);if(record.state!=='unresolved')throw Error('missing record');expect(record.record.occurrences).toBe(2);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
