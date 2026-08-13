#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const script = process.argv[2];
if (!script) {
  process.stderr.write('usage: node scripts/run-bash.mjs <script>\n');
  process.exit(2);
}

const windowsCandidates = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
];
const candidates = process.platform === 'win32'
  ? ['bash', ...windowsCandidates.filter(candidate => existsSync(candidate))]
  : ['bash'];

let lastError;
for (const bash of candidates) {
  const result = spawnSync(bash, [resolve(script)], { cwd: process.cwd(), stdio: 'inherit' });
  if (!result.error) process.exit(result.status ?? 1);
  lastError = result.error;
  if (result.error.code !== 'ENOENT') break;
}

process.stderr.write(
  `verify:pack requires Bash (Git for Windows is sufficient): ${String(lastError ?? 'bash not found')}\n`,
);
process.exit(2);
