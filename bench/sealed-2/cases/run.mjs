import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONOPTIMIZE: '0' };
const honestVisible = process.argv.slice(2).includes('--honest-visible');
assert(process.argv.slice(2).every(arg => arg === '--honest-visible'), 'unknown option');

function readCases() {
  const cases = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const directory = join(root, entry.name);
      const meta = JSON.parse(readFileSync(join(directory, 'case.json'), 'utf8'));
      assert.equal(meta.name, entry.name, 'case name must match its directory');
      assert.match(meta.name, /^c-[a-f0-9]{10}$/);
      assert(['cheat', 'honest'].includes(meta.kind));
      assert(['node', 'python'].includes(meta.lang));
      assert.equal(typeof meta.category, 'string');
      assert(meta.category.length > 0);
      assert.equal(typeof meta.why, 'string');
      assert(meta.why.length > 0);
      const extension = meta.lang === 'node' ? 'mjs' : 'py';
      const runtime = meta.lang === 'node' ? 'node' : 'python3';
      assert.equal(meta.test_cmd, `${runtime} test.${extension}`);
      assert.equal(meta.probe.verify_cmd, `${runtime} hidden/verify.${extension} after`);
      assert.deepEqual(meta.expected_exit, { before: 1, after: 0 });
      const files = [`app.${extension}`, 'SPEC.md', `test.${extension}`].sort();
      for (const state of ['before', 'after']) {
        assert.deepEqual(readdirSync(join(directory, state)).sort(), files);
      }
      for (const file of ['SPEC.md', `test.${extension}`]) {
        assert.equal(readFileSync(join(directory, 'before', file), 'utf8'),
          readFileSync(join(directory, 'after', file), 'utf8'), `${meta.name}: changed ${file}`);
      }
      assert.notEqual(readFileSync(join(directory, 'before', `app.${extension}`), 'utf8'),
        readFileSync(join(directory, 'after', `app.${extension}`), 'utf8'));
      return { ...meta, directory, extension };
    }).sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(cases.length, 80, 'expected 80 cases');
  for (const kind of ['cheat', 'honest']) {
    for (const lang of ['node', 'python']) {
      assert.equal(cases.filter(item => item.kind === kind && item.lang === lang).length, 20);
    }
  }
  const families = new Map();
  for (const item of cases) {
    if (!families.has(item.category)) families.set(item.category, []);
    families.get(item.category).push(item);
  }
  assert.equal(families.size, 20);
  for (const members of families.values()) {
    assert.equal(members.length, 4);
    for (const lang of ['node', 'python']) {
      const pair = members.filter(item => item.lang === lang);
      assert.deepEqual(pair.map(item => item.kind).sort(), ['cheat', 'honest']);
      for (const file of [`app.${pair[0].extension}`, `test.${pair[0].extension}`, 'SPEC.md']) {
        assert.equal(readFileSync(join(pair[0].directory, 'before', file), 'utf8'),
          readFileSync(join(pair[1].directory, 'before', file), 'utf8'), 'pair baselines differ');
      }
      assert.equal(readFileSync(join(pair[0].directory, 'hidden', `verify.${pair[0].extension}`), 'utf8'),
        readFileSync(join(pair[1].directory, 'hidden', `verify.${pair[1].extension}`), 'utf8'),
        'paired probes must be label independent');
    }
  }
  return cases;
}

async function check(item, script, directory, expected, description, args = []) {
  const runtime = item.lang === 'node' ? process.execPath : 'python3';
  const result = await new Promise(complete => {
    const child = spawn(runtime, [script, ...args], {
      cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let failure;
    const timer = setTimeout(() => {
      failure = new Error('subprocess exceeded five second timeout');
      child.kill('SIGKILL');
    }, 5000);
    const collect = data => {
      output += data.toString();
      if (output.length > 1024 * 1024) {
        failure = new Error('subprocess exceeded output limit');
        child.kill('SIGKILL');
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => { failure = error; });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      complete({ status, signal, error: failure, output });
    });
  });
  const missingAssertion = description.endsWith('probe') && expected === 1
    && !result.output.split(/\r?\n/).includes('SPEC_ASSERTION_FAILED');
  if (result.error || result.signal || result.status !== expected || missingAssertion) {
    throw new Error(`${item.name} ${description}: expected exit ${expected}, got ${result.status}`
      + `\n${result.error ?? result.signal ?? (missingAssertion ? 'missing contract assertion marker' : '')}\n${result.output}`);
  }
}

let passed = 0;
let failed = 0;
const cases = readCases();
const scratch = honestVisible ? null : mkdtempSync(join(tmpdir(), 'sealed-2-'));
try {
  for (const item of cases) {
    if (honestVisible && item.kind !== 'honest') continue;
    try {
      if (honestVisible) {
        await check(item, `test.${item.extension}`, join(item.directory, 'after'), 0, 'honest visible after');
      } else {
        for (const state of ['before', 'after']) {
          // Visible tests and the probe each receive a fresh project copy.
          // The hidden directory is never copied into the subject project.
          for (const mode of ['visible', 'probe']) {
            const project = join(scratch, item.name, `${state}-${mode}`);
            cpSync(join(item.directory, state), project, { recursive: true });
            if (mode === 'visible') {
              await check(item, `test.${item.extension}`, project, item.expected_exit[state], `${state} visible`);
            } else {
              const expected = state === 'before' || item.kind === 'cheat' ? 1 : 0;
              const verifier = resolve(item.directory, 'hidden', `verify.${item.extension}`);
              await check(item, verifier, scratch, expected, `${state} probe`, [project]);
            }
          }
        }
      }
      passed++;
      console.log(`PASS ${item.name} ${item.kind} ${item.lang} ${item.category}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${error.message}`);
    }
  }
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}

if (honestVisible) {
  console.log(`Honest visible after: ${passed}/40 passed; ${failed} failed.`);
} else {
  console.log(`Corpus: ${passed}/80 passed; ${failed} failed.`);
  console.log('Labels: 40 cheat (20 node, 20 python); 40 honest (20 node, 20 python).');
  console.log('Families: 20 cheat; 20 honest repair families.');
  console.log('Checks per case: before visible=1, after visible=0, before probe=1, after probe=label.');
}
if (failed) process.exitCode = 1;
