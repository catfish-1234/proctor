#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '../..');
const cli = join(project, 'dist', 'cli.js');
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = {
  GIT_AUTHOR_NAME: 'Kavish Dua',
  GIT_AUTHOR_EMAIL: '131553134+catfish-1234@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'Kavish Dua',
  GIT_COMMITTER_EMAIL: '131553134+catfish-1234@users.noreply.github.com',
};

// Inherited index/worktree settings must never redirect a temporary repo's Git calls.
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (key.startsWith('GIT_')) delete environment[key];
}
Object.assign(environment, identity, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull,
  GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1',
});

function execute(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, env: environment, encoding: 'utf8', timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  if (result.error || result.signal || result.status === null) {
    throw new Error(`${command} did not complete: ${result.error?.message ?? result.signal}`);
  }
  return result;
}

function git(cwd, ...args) {
  const result = execute('git', [
    '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
    '-c', `core.hooksPath=${join(cwd, '.git', 'heldout-no-hooks')}`, '-c', 'commit.gpgsign=false',
    '-c', 'init.templateDir=', ...args,
  ], cwd);
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function options(args) {
  let mode;
  let output;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node bench/heldout/probe.mjs [--default | --all-checks] [--output file]');
      console.log('No mode flag runs both check sets. Findings are observations, not a failing score.');
      return null;
    }
    if (arg === '--default' || arg === '--all-checks') {
      if (mode) throw new Error('Select only one mode, or omit mode flags to run both.');
      mode = arg === '--default' ? 'default' : 'allChecks';
    } else if (arg === '--output') {
      if (output || !args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error('--output requires one file path.');
      }
      output = resolve(args[++i]);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { modes: mode ? [mode] : ['default', 'allChecks'], output };
}

function validatePath(path) {
  if (isAbsolute(path) || /[\\:]/.test(path) || [...path].some(char => char.charCodeAt(0) < 32)
    || path.split('/').some(part => !part || ['.', '..', '.git'].includes(part.toLowerCase()))) {
    throw new Error(`Unsafe case file path: ${path}`);
  }
}

function loadCases() {
  const folder = join(here, 'fixtures');
  const cases = [];
  const corpusFiles = {};
  const names = new Set();
  for (const file of readdirSync(folder).filter(file => file.endsWith('.json')).sort()) {
    const bytes = readFileSync(join(folder, file));
    corpusFiles[file] = hash(bytes);
    const group = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(group) || !group.length) throw new Error(`Empty case group: ${file}`);
    for (const entry of group) {
      if (!entry || typeof entry.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)
        || names.has(entry.name) || !['CHEAT', 'BENIGN'].includes(entry.label)
        || !['category', 'lang', 'why'].every(key => typeof entry[key] === 'string' && entry[key].trim())
        || /[\r\n]/.test(entry.why) || entry.lang !== group[0].lang) {
        throw new Error(`Invalid or duplicate case in ${file}: ${entry?.name}`);
      }
      names.add(entry.name);
      for (const side of ['before', 'after']) {
        const snapshot = entry[side];
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
          throw new Error(`${entry.name}: ${side} must be a complete file map.`);
        }
        for (const [path, content] of Object.entries(snapshot)) {
          validatePath(path);
          if (typeof content !== 'string') throw new Error(`${entry.name}: ${path} must contain text.`);
        }
      }
      const paths = new Set([...Object.keys(entry.before), ...Object.keys(entry.after)]);
      if (![...paths].some(path => entry.before[path] !== entry.after[path])) {
        throw new Error(`Case has no change: ${entry.name}`);
      }
      cases.push(entry);
    }
  }
  for (const label of ['CHEAT', 'BENIGN']) {
    if (cases.filter(entry => entry.label === label).length < 70) {
      throw new Error(`Corpus must include at least 70 ${label} cases.`);
    }
  }
  return { cases, corpusFiles };
}

function writeSnapshot(repo, snapshot) {
  for (const [path, content] of Object.entries(snapshot)) {
    const target = join(repo, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function findings(result, name, mode) {
  if (![0, 1, 2].includes(result.status)) {
    throw new Error(`${name} (${mode}): check exited ${result.status}: ${result.stderr.trim()}`);
  }
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error(`${name} (${mode}): check did not emit valid JSON: ${result.stderr.trim()}`); }
  const items = Array.isArray(report) ? report : report?.findings;
  if (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object'
    || typeof item.verifierId !== 'string' || !['warn', 'warning', 'error', 'info'].includes(item.severity))) {
    throw new Error(`${name} (${mode}): unrecognized findings JSON.`);
  }
  if (result.status !== 0 && items.length === 0) {
    throw new Error(`${name} (${mode}): check failed without findings.`);
  }
  return items.length > 0;
}

const emptyCounts = () => ({ caughtCheats: 0, totalCheats: 0, flaggedBenign: 0, totalBenign: 0 });
function increment(counts, entry, flagged) {
  if (entry.label === 'CHEAT') {
    counts.totalCheats++;
    if (flagged) counts.caughtCheats++;
  } else {
    counts.totalBenign++;
    if (flagged) counts.flaggedBenign++;
  }
}
function record(report, entry, flagged) {
  increment(report.overall, entry, flagged);
  increment(report.byCategory[entry.category] ??= emptyCounts(), entry, flagged);
  increment(report.byLanguage[entry.lang] ??= emptyCounts(), entry, flagged);
  if (entry.label === 'CHEAT' && !flagged) report.misses.push(entry.name);
  if (entry.label === 'BENIGN' && flagged) report.falsePositives.push(entry.name);
}

function buildHash(folder) {
  const files = [];
  function visit(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.isFile()) files.push([relative(folder, path).split('\\').join('/'), hash(readFileSync(path))]);
    }
  }
  visit(folder);
  return hash(JSON.stringify(files));
}

function display(title, report) {
  const line = (name, counts) => console.log(
    `${name}: caught cheats ${counts.caughtCheats}/${counts.totalCheats}; flagged benign ${counts.flaggedBenign}/${counts.totalBenign}`,
  );
  console.log(`\n${title}`);
  line('Total', report.overall);
  for (const [heading, groups] of [['By category', report.byCategory], ['By language', report.byLanguage]]) {
    console.log(`${heading}:`);
    for (const key of Object.keys(groups).sort()) line(`  ${key}`, groups[key]);
  }
  console.log('Misses:');
  for (const name of report.misses) console.log(`  ${name}`);
  console.log('False positives:');
  for (const name of report.falsePositives) console.log(`  ${name}`);
}

function main() {
  const config = options(process.argv.slice(2));
  if (!config) return;
  const { cases, corpusFiles } = loadCases();
  if (!existsSync(cli)) throw new Error('Build missing. Run npm run build first.');
  const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provenance: {
      version: pkg.version,
      sourceRevision: git(project, 'rev-parse', 'HEAD'),
      sourceTree: git(project, 'rev-parse', 'HEAD:src'),
      sourceDirty: git(project, 'status', '--porcelain', '--', 'src').length > 0,
      buildSha256: buildHash(join(project, 'dist')),
      scorerSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
      node: process.version, platform: process.platform,
      git: git(project, '--version'), corpusFiles,
    },
    modes: {},
  };
  for (const mode of config.modes) {
    report.modes[mode] = {
      command: ['node', 'dist/cli.js', 'check', '--staged', '--json', ...(mode === 'allChecks' ? ['--all-checks'] : [])],
      overall: emptyCounts(), byCategory: {}, byLanguage: {}, misses: [], falsePositives: [],
    };
  }
  for (const [index, entry] of cases.entries()) {
    const repo = mkdtempSync(join(tmpdir(), 'proctor-heldout-'));
    try {
      git(repo, 'init', '-q', '-b', 'main');
      writeSnapshot(repo, entry.before);
      git(repo, 'add', '--all');
      git(repo, 'commit', '-q', '--allow-empty', '-m', 'Baseline');
      for (const path of Object.keys(entry.before)) {
        if (!(path in entry.after)) rmSync(join(repo, ...path.split('/')));
      }
      writeSnapshot(repo, entry.after);
      git(repo, 'add', '--all');
      for (const mode of config.modes) {
        const args = [cli, 'check', '--staged', '--json', ...(mode === 'allChecks' ? ['--all-checks'] : [])];
        record(report.modes[mode], entry, findings(execute(process.execPath, args, repo), entry.name, mode));
      }
    } finally {
      rmSync(repo, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    }
    if ((index + 1) % 24 === 0) console.error(`Scored ${index + 1}/${cases.length} cases.`);
  }
  for (const [mode, result] of Object.entries(report.modes)) {
    display(mode === 'default' ? 'Default checks' : 'All checks', result);
  }
  if (config.output) {
    mkdirSync(dirname(config.output), { recursive: true });
    writeFileSync(config.output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nResults written to ${config.output}`);
  }
}

export { emptyCounts, findings, record, validatePath };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
