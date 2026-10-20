// Uses the locked build toolchain. No network access and no changes to the checked-out source.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const [outputArg, ref, mode = 'core'] = process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node scripts/build-detection-core.mjs OUTPUT [REF] [core|cli]');
const repo = process.cwd();
const output = resolve(outputArg);
const scratch = mkdtempSync(join(tmpdir(),'proctor-core-'));
try {
  let root = repo;
  if (ref) {
    root = scratch;
    const git = args => execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:32*1024*1024});
    const files = git(['ls-tree','-rz','--name-only',ref,'--','src','package.json']).split('\0').filter(file=>file && !file.split('/').includes('heldout'));
    for (const file of files) {
      const path = join(root,file);
      mkdirSync(dirname(path),{recursive:true});
      writeFileSync(path,git(['show',`${ref}:${file}`]));
    }
  }
  const entry = join(scratch,'entry.ts');
  writeFileSync(entry,`export { buildContext, RH_CHECKS, WI_CHECKS } from ${JSON.stringify(join(root,'src','context','index.ts'))};\nexport { runChecks } from ${JSON.stringify(join(root,'src','engine.ts'))};\n`);
  await build({entryPoints:[mode === 'cli' ? join(root,'src','cli.ts') : entry],outfile:output,
    bundle:true,packages:'external',platform:'node',format:'esm',target:'node20',external:['@anthropic-ai/sdk'],nodePaths:[join(repo,'node_modules')]});
} finally { rmSync(scratch,{recursive:true,force:true}); }
