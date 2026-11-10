import { describe, expect, it } from 'vitest';
import { verificationEvidence, checkExitCode, resultReport } from '../src/verification.js';
import { buildReceipt } from '../src/receipt.js';
import { badgeLine, badgeUrl } from '../src/badge/index.js';
import { sarifReport } from '../src/reporters/sarif.js';
import type { DynamicResult, TestRun } from '../src/dynamic/runner.js';
const run = (label: string, passed: string[], failed: string[] = []): TestRun => ({label, passed, failed, exitCode: failed.length ? 1 : 0, command: 'node --test', detail: ''});
const complete = (...runs: TestRun[]): DynamicResult => ({status:'completed', findings:[], runs, notes:[], elapsedMs:1});
describe('verification result contract', () => {
  it('keeps static-only receipts and legacy findings independent of dynamic opt-in', () => {
    const evidence=verificationEvidence();
    expect(evidence.status).toBe('not-requested');
    expect(buildReceipt([]).status).toBe('honest-pass');
    expect(checkExitCode([],true,false,evidence)).toBe(0);
    expect(checkExitCode([],true,true,evidence)).toBe(3);
  });
  it.each(['not run: unsupported runner','overall timeout (1ms)','inconclusive: duplicate report'])('preserves incomplete reason %s without accusing',reason=>{
    const dynamic:DynamicResult={status:'skipped', reason, findings:[],runs:[],notes:[],elapsedMs:1};
    const evidence=verificationEvidence(dynamic),receipt=buildReceipt([],new Date(),evidence);
    expect(evidence.status).toBe('incomplete');expect(evidence.reasons).toEqual([reason]);
    expect(receipt.status).toBe('incomplete');expect(badgeLine(receipt)).not.toContain('honest');expect(badgeUrl(receipt)).toContain('incomplete');
    expect(checkExitCode([],false,false,evidence)).toBe(0);expect(checkExitCode([],true,true,evidence)).toBe(3);
    const report=JSON.parse(resultReport([],['RH001'],evidence,true,3));
    expect(report.schemaVersion).toBe(1);expect(report.status).toBe('incomplete');expect(report.findings).toEqual([]);
    expect(report.checks.dynamic.reason).toBe(reason);expect(report.checks.static.selected).toEqual(['RH001']);
    expect(JSON.parse(sarifReport([],evidence)).runs[0].properties.verification.status).toBe('incomplete');
  });
  it('preserves baseline differential without deciding whether the API change was allowed',()=>{
    const evidence=verificationEvidence(complete(run('original tests / original code',['contract']),run('new tests / new code',['contract']),run('original tests + baseline controls / new code',[],['contract'])));
    expect(evidence.status).toBe('review-required');expect(buildReceipt([],new Date(),evidence).status).toBe('review-required');
    expect(checkExitCode([],true,true,evidence)).toBe(3);
    const report=JSON.parse(resultReport([],['RH001'],evidence,false,0));
    expect(report.checks.dynamic.runs[2].failed).toEqual(['contract']);expect(report.verification.limits).toContain('not authenticated');
  });
  it('allows a red baseline honest fix and does not treat expected reverse failures as incomplete',()=>{
    const evidence=verificationEvidence(complete(run('original tests / original code',[],['fixed']),run('new tests / new code',['fixed']),run('new tests + baseline controls / original code',[],['fixed'])));
    expect(evidence.status).toBe('complete');expect(checkExitCode([],true,true,evidence)).toBe(0);
  });
  it('does not promote missing observations or a failing current suite to clean',()=>{
    expect(verificationEvidence(complete()).status).toBe('incomplete');
    expect(verificationEvidence(complete(run('original tests / original code',['x']),run('new tests / new code',[],['x']))).status).toBe('review-required');
  });
  it('keeps repeated inconsistent outcomes review-required without claiming a real race',()=>{
    const evidence=verificationEvidence(complete(run('original tests / original code',['x']),run('new tests / new code',['x']),run('new tests / new code repeat 1',[],['x'])));
    expect(evidence.status).toBe('review-required');expect(checkExitCode([],true,true,evidence)).toBe(3);
  });
  it('marks failed static execution incomplete in the envelope',()=>{
    const evidence={...verificationEvidence(),status:'incomplete' as const,reasons:['verifier failed']};
    const report=JSON.parse(resultReport([],['RH001'],evidence,true,3,'verifier failed'));
    expect(report.status).toBe('incomplete');expect(report.checks.static.status).toBe('incomplete');expect(report.checks.static.reason).toBe('verifier failed');
  });
  it('preserves a blocking finding over incomplete verification without manufacturing findings',()=>{
    const evidence=verificationEvidence({status:'skipped',reason:'timeout',findings:[],runs:[],notes:[],elapsedMs:1});
    const findings=[{verifierId:'RH001',severity:'error' as const,file:'x',line:1,message:'m',suggestion:'s'}];
    expect(checkExitCode(findings,true,true,evidence)).toBe(2);expect(buildReceipt(findings,new Date(),evidence).status).toBe('caught');
  });
});
