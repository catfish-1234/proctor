// Rebuildable sample from the twenty repositories named in the historical audit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const repositories = ['sindresorhus/got','axios/axios','expressjs/express','chalk/chalk','date-fns/date-fns','sindresorhus/execa','colinhacks/zod','psf/requests','pallets/flask','psf/black','encode/httpx','pydantic/pydantic','pallets/click','gin-gonic/gin','spf13/cobra','clap-rs/clap','BurntSushi/ripgrep','sinatra/sinatra','google/gson','guzzle/guzzle'];
const [cacheArg = 'work/human-commits', manifestArg = 'bench/detection/human-sample.json'] = process.argv.slice(2);
const cache = resolve(cacheArg);
mkdirSync(cache, { recursive: true });
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
const previous = existsSync(manifestArg) ? JSON.parse(readFileSync(manifestArg, 'utf8')) : undefined;
const samples = [];
for (const repository of repositories) {
  const cwd = join(cache, repository.replace('/', '--'));
  if (!existsSync(cwd)) git(cache, ['clone','--bare','--filter=blob:none','--depth=250',`https://github.com/${repository}.git`,cwd]);
  const pinned = previous?.samples.filter(sample => sample.repository === repository);
  let commits;
  if (pinned) commits = pinned.map(sample => sample.sha);
  else {
    commits = git(cwd, ['log','--no-merges','--before=2026-10-20T00:00:00Z','--format=%H%x09%an%x09%ae','-n','240'])
      .trim().split('\n').filter(line => !/\[bot\]|dependabot|renovate|github-actions|\bbot\b/i.test(line.split('\t').slice(1).join(' ')))
      .map(line => line.split('\t')[0]).filter(sha => git(cwd, ['rev-list','--parents','-n','1',sha]).trim().split(' ').length === 2).slice(0,35);
    if (commits.length !== 35) throw new Error(`${repository}: expected 35 eligible commits, got ${commits.length}`);
  }
  for (const sha of commits) {
    if (pinned) git(cwd, ['fetch','--filter=blob:none','origin',sha]);
    const parent = git(cwd, ['rev-parse',`${sha}^`]).trim();
    const diff = git(cwd, ['diff','--no-ext-diff','--no-color','--find-renames',parent,sha,'--','.',':(exclude)**/heldout/**',':(exclude)heldout/**']);
    const digest = createHash('sha256').update(diff).digest('hex');
    const expected = pinned?.find(sample => sample.sha === sha);
    if (expected && expected.patchSha256 !== digest) throw new Error(`Patch changed for ${repository}@${sha}`);
    writeFileSync(join(cache,`${sha}.diff`),diff);
    samples.push({ repository, sha, parent, patchSha256:digest });
  }
  console.log(`${repository}: ${commits.length}`);
}
writeFileSync(manifestArg, JSON.stringify({ cutoff:'2026-10-20T00:00:00Z', selection:'35 newest non-merge commits per repository before cutoff, excluding bot identities; not the missing original 689-commit sample', samples },null,2)+'\n');
