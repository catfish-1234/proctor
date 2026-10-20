import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import parseDiff from 'parse-diff';
const [modulePath, cacheArg, outputPath] = process.argv.slice(2);
if (!modulePath || !cacheArg || !outputPath) throw new Error('Expected core module, cache directory, output JSON');
const { buildContext, runChecks, RH_CHECKS, WI_CHECKS } = await import(pathToFileURL(resolve(modulePath)).href);
const manifest = JSON.parse(readFileSync('bench/detection/human-sample.json','utf8'));
const rows = [];
for (const sample of manifest.samples) {
  const cwd = resolve(cacheArg,sample.repository.replace('/','--'));
  const raw = readFileSync(join(cacheArg,`${sample.sha}.diff`),'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== sample.patchSha256) throw new Error(`Patch mismatch: ${sample.sha}`);
  const files = parseDiff(raw);
  const context = await buildContext(cwd, files, {configRef:sample.parent,quiet:true});
  context.committedDiff = true;
  context.commitMessage = execFileSync('git',['show','-s','--format=%s',sample.sha],{cwd,encoding:'utf8'}).trim();
  // A bare cache has no working tree. Discover names at the sampled commit, not today's HEAD.
  const paths = execFileSync('git',['ls-tree','-r','--name-only',sample.sha],{cwd,encoding:'utf8',maxBuffer:32*1024*1024}).split('\n');
  context.testFiles = paths.filter(path => !path.split('/').includes('heldout') && context.isTestFile(path));
  const defaults = await runChecks(context);
  const all = await runChecks({...context,enabled:[...RH_CHECKS,...WI_CHECKS]});
  rows.push({...sample,defaults,all});
}
const summary = {};
for (const mode of ['defaults','all']) {
  const any = rows.filter(row => row[mode].length).length;
  const blocking = rows.filter(row => row[mode].some(f=>f.severity==='error')).length;
  summary[mode] = {sampleSize:rows.length,any,blocking,anyRate:100*any/rows.length,blockingRate:100*blocking/rows.length};
}
summary.byRule = {};
for (const id of [...RH_CHECKS,...WI_CHECKS]) {
  const matching = rows.filter(row=>row.all.some(f=>f.verifierId===id));
  summary.byRule[id] = {any:matching.length,blocking:matching.filter(row=>row.all.some(f=>f.verifierId===id&&f.severity==='error')).length};
}
writeFileSync(outputPath,JSON.stringify({summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
