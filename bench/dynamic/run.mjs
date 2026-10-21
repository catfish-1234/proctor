import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const commands = { node: ['node', '--test', 'test.mjs'], python: ['python3', 'test.py'] };

// Commands are argv arrays, never shell strings. PYTHON may select Python 3 on Windows.
export function runCommand(argv, cwd, timeout = 10_000) {
  const executable = argv[0] === 'node' ? process.execPath
    : argv[0] === 'python3' ? (process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'))
      : argv[0];
  const childEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONOPTIMIZE: '0', NO_COLOR: '1' };
  // Each snapshot is an independent test run, even when called by node --test.
  delete childEnv.NODE_TEST_CONTEXT;
  return temporary(async capture => {
    const stdoutPath = path.join(capture, 'stdout');
    const stderrPath = path.join(capture, 'stderr');
    const stdoutFile = await open(stdoutPath, 'w');
    const stderrFile = await open(stderrPath, 'w');
    let exit_code;
    try {
      // Files also work in runtimes where child-process pipes do not capture output.
      exit_code = await new Promise((resolve, reject) => {
        const child = spawn(executable, argv.slice(1), {
          cwd, timeout, stdio: ['ignore', stdoutFile.fd, stderrFile.fd],
          env: childEnv,
        });
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (signal || code === null) reject(new Error(`${argv.join(' ')} terminated: ${signal}`));
          else resolve(code);
        });
      });
    } finally {
      await Promise.all([stdoutFile.close(), stderrFile.close()]);
    }
    const [stdout, stderr] = await Promise.all([readFile(stdoutPath, 'utf8'), readFile(stderrPath, 'utf8')]);
    return { exit_code, stdout, stderr };
  });
}

async function success(argv, cwd) {
  const result = await runCommand(argv, cwd);
  assert.equal(result.exit_code, 0, `${argv.join(' ')} failed:\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

export async function loadCases(casesDirectory = path.join(directory, 'cases')) {
  const entries = (await readdir(casesDirectory, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return Promise.all(entries.map(async entry => {
    const caseDirectory = path.join(casesDirectory, entry.name);
    const meta = JSON.parse(await readFile(path.join(caseDirectory, 'case.json'), 'utf8'));
    assert.match(meta.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(meta.name, entry.name);
    assert.ok(['cheat', 'honest'].includes(meta.kind), `${entry.name}: kind`);
    for (const key of ['category', 'why']) assert.ok(typeof meta[key] === 'string' && meta[key].trim());
    assert.ok(Object.hasOwn(commands, meta.lang), `${entry.name}: language`);
    assert.deepEqual(meta.test_cmd, commands[meta.lang]);
    assert.ok([0, 1].includes(meta.expected_exit?.before), `${entry.name}: base exit`);
    assert.equal(meta.expected_exit.after, 0);
    assert.deepEqual(meta.probe?.verify_cmd, [commands[meta.lang][0], `hidden/verify.${meta.lang === 'node' ? 'mjs' : 'py'}`]);
    for (const side of ['before', 'after', 'hidden']) {
      const files = await readdir(path.join(caseDirectory, side), { recursive: true, withFileTypes: true });
      assert.ok(files.length, `${entry.name}: empty ${side}`);
      assert.ok(files.every(file => !file.isSymbolicLink() && file.name !== '.git' && file.name !== 'hidden'), `${entry.name}: unsafe tree`);
    }
    return { ...meta, caseDirectory };
  }));
}

async function temporary(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proctor-dynamic-'));
  try { return await callback(root); } finally { await rm(root, { recursive: true, force: true }); }
}

// No hidden files are present unless scoring is explicitly requested.
export async function withSnapshot(item, side, callback, { scoring = false } = {}) {
  assert.ok(['before', 'after'].includes(side));
  return temporary(async root => {
    const tree = path.join(root, 'project');
    await cp(path.join(item.caseDirectory, side), tree, { recursive: true });
    if (scoring) await cp(path.join(item.caseDirectory, 'hidden'), path.join(tree, 'hidden'), { recursive: true });
    return callback(tree);
  });
}

// This is the label oracle, not a cross-version test execution detector.
export async function validateCase(item) {
  const record = { name: item.name, kind: item.kind };
  for (const side of ['before', 'after']) {
    const result = await withSnapshot(item, side, tree => runCommand(item.test_cmd, tree));
    assert.equal(result.exit_code, item.expected_exit[side], `${item.name} ${side}:\n${result.stdout}\n${result.stderr}`);
    record[side] = result.exit_code;
  }
  const probe = await withSnapshot(item, 'after', tree => runCommand(item.probe.verify_cmd, tree), { scoring: true });
  assert.doesNotMatch(probe.stdout + probe.stderr, /SyntaxError|ModuleNotFoundError|ERR_MODULE_NOT_FOUND|ImportError/,
    `${item.name}: probe failed to load`);
  assert.equal(probe.exit_code, item.kind === 'cheat' ? 1 : 0, `${item.name} probe disagrees with kind:\n${probe.stdout}\n${probe.stderr}`);
  record.probe = probe.exit_code;
  return record;
}

async function mapLimited(items, operation, concurrency = 4) {
  const output = Array.from({ length: items.length });
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      output[current] = await operation(items[current]);
    }
  }));
  return output;
}

export async function validateCorpus(items = undefined) {
  return mapLimited(items ?? await loadCases(), validateCase);
}

// Future evaluators can run their own detector on this repo and base commit.
// The callback receives no hidden probe files or labels in the git working tree.
export async function withCaseRepository(item, callback) {
  return withSnapshot(item, 'before', async tree => {
    const git = args => success(['git', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=', ...args], tree);
    await git(['init', '--quiet']);
    await git(['config', 'user.name', 'Corpus Base']);
    await git(['config', 'user.email', 'corpus@example.org']);
    await git(['add', '--all']);
    await git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Corpus base']);
    const base = await git(['rev-parse', 'HEAD']);
    for (const entry of await readdir(tree)) {
      if (entry !== '.git') await rm(path.join(tree, entry), { recursive: true, force: true });
    }
    await cp(path.join(item.caseDirectory, 'after'), tree, { recursive: true });
    await git(['add', '--all']);
    return callback({ tree, base });
  });
}

export function summarize(records, mode) {
  const counts = () => ({ caught_cheats: 0, total_cheats: 0, flagged_honest: 0, total_honest: 0 });
  const total = counts();
  const by_category = {};
  for (const record of records) {
    const category = by_category[record.category] ??= counts();
    for (const target of [total, category]) {
      if (record.kind === 'cheat') {
        target.total_cheats++;
        if (record[mode].flagged) target.caught_cheats++;
      } else {
        target.total_honest++;
        if (record[mode].flagged) target.flagged_honest++;
      }
    }
  }
  return { ...total, by_category };
}

export async function runStatic(items = undefined) {
  const cli = path.join(repository, 'dist', 'cli.js');
  const records = await mapLimited(items ?? await loadCases(), item => withCaseRepository(item, async ({ tree }) => {
    const record = { name: item.name, kind: item.kind, category: item.category, lang: item.lang };
    for (const [mode, flags] of [['default', []], ['all_checks', ['--all-checks']]]) {
      const result = await runCommand(['node', cli, 'check', '--staged', '--json', ...flags, tree], tree);
      assert.ok([0, 1, 2].includes(result.exit_code), `${item.name} checker exit: ${result.stderr}`);
      assert.ok(result.stdout.trim(), `${item.name}: checker returned no JSON:\n${result.stderr}`);
      const verdict = JSON.parse(result.stdout);
      // Only the public JSON report is consumed. Any finding counts, including warnings.
      assert.ok(Array.isArray(verdict), `${item.name}: unexpected check JSON`);
      record[mode] = { flagged: verdict.length > 0, exit_code: result.exit_code, findings: verdict };
    }
    return record;
  }));
  return {
    schema_version: 1,
    version: JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8')).version,
    source_commit: await success(['git', 'rev-parse', 'HEAD'], repository),
    definition: 'A case is flagged when the public JSON array is nonempty, including warnings. Exit status is recorded separately.',
    default: summarize(records, 'default'),
    all_checks: summarize(records, 'all_checks'),
    cases: records,
  };
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1 && (!args.length || args[0] === '--validate'), 'Usage: node bench/dynamic/run.mjs [--validate]');
  const items = await loadCases();
  const validation = await validateCorpus(items);
  if (args[0] === '--validate') {
    console.log(`Validated ${validation.length} cases: before/after tests and hidden probes agree.`);
    return;
  }
  const results = await runStatic(items);
  await writeFile(path.join(directory, 'results-static.json'), JSON.stringify(results, null, 2) + '\n');
  await writeFile(path.join(directory, 'results-validation.json'), JSON.stringify({ schema_version: 1, cases: validation }, null, 2) + '\n');
  for (const mode of ['default', 'all_checks']) {
    const row = results[mode];
    console.log(`${mode}: caught cheats ${row.caught_cheats}/${row.total_cheats}; flagged honest ${row.flagged_honest}/${row.total_honest}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
