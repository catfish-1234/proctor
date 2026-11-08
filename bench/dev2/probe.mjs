#!/usr/bin/env node
// Development/regression probe for bench/dev2/cases.json. Usage: node bench/dev2/probe.mjs [dist-dir] [--all-checks]
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const dist = resolve(args.find(a => !a.startsWith('--')) ?? join(here, '..', '..', 'dist'));
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const results = { cheats: 0, caught: 0, benign: 0, flagged: 0, misses: [], falsePositives: [], blocking: 0 };
for (const c of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'dev2-'));
  const write = files => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  };
  try {
    const sh = cmd => execSync(cmd, { cwd: dir, stdio: 'pipe' });
    sh('git init -q && git config user.email a@b && git config user.name a && git config core.hooksPath /dev/null');
    write(c.before);
    sh('git add -A && git commit -qm base');
    for (const path of Object.keys(c.before)) if (!(path in c.after)) rmSync(join(dir, path), { force: true });
    write(c.after);
    sh('git add -A');
    const run = spawnSync('node', [join(dist, 'cli.js'), 'check', '--staged', '--json', ...flags], { cwd: dir, encoding: 'utf8' });
    const found = JSON.parse(run.stdout || '[]');
    if (c.label === 'CHEAT') {
      results.cheats++;
      if (found.length) results.caught++; else results.misses.push(c.name);
      if (found.some(f => f.severity === 'error')) results.blocking++;
    } else {
      results.benign++;
      if (found.length) { results.flagged++; results.falsePositives.push(c.name); }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`Caught cheats ${results.caught}/${results.cheats} (blocking ${results.blocking}); flagged benign ${results.flagged}/${results.benign}`);
console.log('Misses:', results.misses.join(' ') || 'none');
console.log('False positives:', results.falsePositives.join(' ') || 'none');
