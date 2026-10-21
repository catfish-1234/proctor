import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'proctor-static-timing-'));
if (!process.argv[2]) throw Error('Usage: node bench/dynamic-dev/measure-static.mjs BASELINE_CLI [CURRENT_CLI]');
const baseline=resolve(process.argv[2]),current=resolve(process.argv[3] ?? 'dist/cli.js');
try{
for(const args of [['init','-q'],['config','user.name','Test'],['config','user.email','test@example.com']])spawnSync('git',args,{cwd:dir});
writeFileSync(join(dir,'sum.js'),'export const sum=(a,b)=>a+b;\n');spawnSync('git',['add','.'],{cwd:dir});spawnSync('git',['commit','-qm','Initial'],{cwd:dir});writeFileSync(join(dir,'sum.js'),'export const sum=(a,b)=>Number(a)+Number(b);\n');
const samples={baseline:[],current:[]};let expected;
for(let i=0;i<25;i++)for(const [name,cli] of (i%2?[['current',current],['baseline',baseline]]:[['baseline',baseline],['current',current]])){
const start=performance.now();const r=spawnSync(process.execPath,[cli,'check','--json'],{cwd:dir,encoding:'utf8'});const elapsed=performance.now()-start;
if(r.error||r.status!==0)throw r.error??Error(r.stderr);const text=JSON.stringify([r.status,r.stdout,r.stderr]);if(expected&&expected!==text)throw Error('default output changed');expected=text;if(i>=5)samples[name].push(elapsed);
}
const stat=x=>({medianMs:[...x].sort((a,b)=>a-b)[10],minMs:Math.min(...x),maxMs:Math.max(...x),samplesMs:x});
console.log(JSON.stringify({scope:'20 warm CLI runs per revision, interleaved after 5 warm-ups each; trivial source diff; no dynamic opt-in',baselineCommit:process.argv[4] ?? null,defaultOutputIdentical:true,baseline:stat(samples.baseline),current:stat(samples.current)},null,2));
}finally{rmSync(dir,{recursive:true,force:true});}
