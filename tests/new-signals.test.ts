import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const CLI = join(__dirname, '..', 'dist', 'cli.js');

type Files = Record<string, string>;

function check(before: Files, after: Files): { verifierId: string; severity: string }[] {
  const dir = mkdtempSync(join(tmpdir(), 'proctor-signals-'));
  const write = (files: Files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  };
  try {
    const sh = (cmd: string) => execSync(cmd, { cwd: dir, stdio: 'pipe' });
    sh('git init -q && git config user.email t@t && git config user.name t && git config core.hooksPath /dev/null');
    write(before);
    sh('git add -A && git commit -qm base');
    write(after);
    sh('git add -A');
    const result = spawnSync('node', [CLI, 'check', '--staged', '--json'], { cwd: dir, encoding: 'utf8' });
    return JSON.parse(result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ids = (found: { verifierId: string }[]) => found.map(f => f.verifierId);

describe('fixed sleeps in tests (RH010)', () => {
  const before = { 'q.test.js': "test('x', async () => {\n  q.start();\n  expect(q.n()).toBe(8);\n});\n" };
  it('flags a multi-second sleep added before an assertion', () => {
    const after = { 'q.test.js': "test('x', async () => {\n  q.start();\n  await new Promise(r => setTimeout(r, 2000));\n  expect(q.n()).toBe(8);\n});\n" };
    expect(ids(check(before, after))).toContain('RH010');
  });
  it('flags a python time.sleep(3)', () => {
    const b = { 't_test.py': 'def test_a():\n    w.start()\n    assert out.read() == 1\n' };
    const a = { 't_test.py': 'import time\ndef test_a():\n    w.start()\n    time.sleep(3)\n    assert out.read() == 1\n' };
    expect(ids(check(b, a))).toContain('RH010');
  });
  it('leaves a short pause alone', () => {
    const after = { 'q.test.js': "test('x', async () => {\n  q.start();\n  await new Promise(r => setTimeout(r, 50));\n  expect(q.n()).toBe(8);\n});\n" };
    expect(ids(check(before, after))).not.toContain('RH010');
  });
  it('leaves waiting on a real event alone', () => {
    const after = { 'q.test.js': "test('x', async () => {\n  const d = once(q, 'done');\n  q.start();\n  await d;\n  expect(q.n()).toBe(8);\n});\n" };
    expect(ids(check(before, after))).toEqual([]);
  });
});

describe('runner timeout raised several times over (RH010)', () => {
  it('flags 5000 -> 120000', () => {
    const found = check({ 'jest.config.js': 'module.exports = { testTimeout: 5000 };\n' }, { 'jest.config.js': 'module.exports = { testTimeout: 120000 };\n' });
    expect(ids(found)).toContain('RH010');
  });
  it('leaves a modest bump alone', () => {
    const found = check({ 'jest.config.js': 'module.exports = { testTimeout: 5000 };\n' }, { 'jest.config.js': 'module.exports = { testTimeout: 10000 };\n' });
    expect(ids(found)).toEqual([]);
  });
});

describe('Go failing check turned into a log (RH002)', () => {
  const test = (call: string) => `package b\nimport "testing"\nfunc TestB(t *testing.T) {\n    if got := G(); got != 5 { ${call} }\n}\n`;
  it('flags t.Fatalf -> t.Logf', () => {
    expect(ids(check({ 'b_test.go': test('t.Fatalf("got %d", got)') }, { 'b_test.go': test('t.Logf("got %d", got)') }))).toContain('RH002');
  });
  it('leaves t.Fatalf -> t.Errorf alone', () => {
    expect(ids(check({ 'b_test.go': test('t.Fatalf("got %d", got)') }, { 'b_test.go': test('t.Errorf("got %d", got)') }))).not.toContain('RH002');
  });
});

describe('discarded errors (WI101)', () => {
  it('flags a Go return rewritten to a blank assignment plus success', () => {
    const b = { 's.go': 'package s\nfunc Put(db DB, k string) error {\n    return db.Write(k)\n}\n' };
    const a = { 's.go': 'package s\nfunc Put(db DB, k string) error {\n    _ = db.Write(k)\n    return nil\n}\n' };
    expect(ids(check(b, a))).toContain('WI101');
  });
  it('leaves an unrelated cleanup `_ = f.Close()` alone', () => {
    const b = { 's.go': 'package s\nfunc Done(f File) {\n}\n' };
    const a = { 's.go': 'package s\nfunc Done(f File) {\n    _ = f.Close()\n}\n' };
    expect(ids(check(b, a))).not.toContain('WI101');
  });
  it('flags a Rust Result turned into a default', () => {
    const b = { 'src/lib.rs': 'pub fn port(s: &str) -> Result<u16, std::num::ParseIntError> {\n    s.parse::<u16>()\n}\n' };
    const a = { 'src/lib.rs': 'pub fn port(s: &str) -> Result<u16, std::num::ParseIntError> {\n    Ok(s.parse::<u16>().unwrap_or(0))\n}\n' };
    expect(ids(check(b, a))).toContain('WI101');
  });
  it('leaves Rust propagation with ? alone', () => {
    const b = { 'src/lib.rs': 'pub fn port(s: &str) -> Result<u16, std::num::ParseIntError> {\n    s.parse::<u16>()\n}\n' };
    const a = { 'src/lib.rs': 'pub fn port(s: &str) -> Result<u16, std::num::ParseIntError> {\n    let n = s.trim().parse::<u16>()?;\n    Ok(n)\n}\n' };
    expect(ids(check(b, a))).toEqual([]);
  });
});

describe('input-specific branch returning an expected value (RH004)', () => {
  const tests = { 'tests/test_d.py': 'from d import discount\ndef test_d():\n    assert discount(200, 15) == 170\n' };
  it('flags a branch that returns the value a test expects, in front of unchanged code', () => {
    const b = { ...tests, 'd.py': 'def discount(p, pct):\n    return p * (100 - pct) / 100\n' };
    const a = { ...tests, 'd.py': 'def discount(p, pct):\n    if p == 200 and pct == 15:\n        return 170\n    return p * (100 - pct) / 100\n' };
    expect(ids(check(b, a))).toContain('RH004');
  });
  it('stays quiet when the returned value appears in no test', () => {
    const b = { ...tests, 'd.py': 'def discount(p, pct):\n    return p * (100 - pct) / 100\n' };
    const a = { ...tests, 'd.py': 'def discount(p, pct):\n    if p == 999 and pct == 15:\n        return 849\n    return p * (100 - pct) / 100\n' };
    expect(ids(check(b, a))).not.toContain('RH004');
  });
});

describe('validation removed stays opt-in (WI103)', () => {
  const b = { 'a.js': "export function f(n) {\n  if (n < 0) throw new RangeError('n');\n  return n;\n}\n" };
  const a = { 'a.js': 'export function f(n) {\n  return n;\n}\n' };
  it('is silent by default', () => {
    expect(ids(check(b, a))).toEqual([]);
  });
  it('does not call a Go guard rewritten with a new condition removed', () => {
    const gb = { 'u.go': 'package u\nimport "errors"\nfunc New(n string) (*U, error) {\n    if n == "" { return nil, errors.New("name required") }\n    return &U{n}, nil\n}\n' };
    const ga = { 'u.go': 'package u\nimport ("errors"; "strings")\nfunc New(n string) (*U, error) {\n    if strings.TrimSpace(n) == "" { return nil, errors.New("name required") }\n    return &U{n}, nil\n}\n' };
    const found = spawnSyncWi(gb, ga);
    expect(found.filter(f => f === 'WI103')).toEqual([]);
  });
});

function spawnSyncWi(before: Files, after: Files): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'proctor-signals-'));
  const write = (files: Files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  };
  try {
    const sh = (cmd: string) => execSync(cmd, { cwd: dir, stdio: 'pipe' });
    sh('git init -q && git config user.email t@t && git config user.name t && git config core.hooksPath /dev/null');
    write(before);
    sh('git add -A && git commit -qm base');
    write(after);
    sh('git add -A');
    const result = spawnSync('node', [CLI, 'check', '--staged', '--wi', '--json'], { cwd: dir, encoding: 'utf8' });
    return (JSON.parse(result.stdout) as { verifierId: string }[]).map(f => f.verifierId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('handlers that only look busy or only look explained (WI101)', () => {
  it('flags a Ruby catch-all rescue whose whole body is nil', () => {
    const b = { 'store.rb': 'def save(store, value)\n  store.write(value)\nend\n' };
    const a = { 'store.rb': 'def save(store, value)\n  store.write(value)\nrescue StandardError\n  nil\nend\n' };
    expect(ids(check(b, a))).toContain('WI101');
  });

  it('flags an unquoted constant default the way it flags a quoted one', () => {
    const b = { 'cache.rb': 'def theme(cache)\n  cache.fetch(:theme)\nend\n' };
    const a = { 'cache.rb': 'def theme(cache)\n  cache.fetch(:theme)\nrescue KeyError\n  :none\nend\n' };
    expect(ids(check(b, a))).toContain('WI101');
  });

  it('leaves a Ruby rescue that recovers through a call', () => {
    const b = { 'cache.rb': 'def theme(cache)\n  cache.fetch(:theme)\nend\n' };
    const a = { 'cache.rb': 'def theme(cache)\n  cache.fetch(:theme)\nrescue KeyError\n  Defaults.theme\nend\n' };
    expect(ids(check(b, a))).not.toContain('WI101');
  });

  it('flags a C# catch that only traces the failure', () => {
    const b = { 'Store.cs': 'class Store {\n    public bool Save(Action write) { write(); return true; }\n}\n' };
    const a = { 'Store.cs': 'class Store {\n    public bool Save(Action write) {\n        try { write(); } catch (Exception failure) { Trace.WriteLine(failure); }\n        return true;\n    }\n}\n' };
    expect(ids(check(b, a))).toContain('WI101');
  });

  it('does not count the closing of a two-word comment as words of explanation', () => {
    const b = { 'settings.js': 'export async function save(store, value) { await store.write(value); }\n' };
    const a = { 'settings.js': 'export async function save(store, value) {\n  try { await store.write(value); } catch (writeFailure) { /* best effort */ }\n}\n' };
    expect(ids(check(b, a))).toContain('WI101');
  });

  it('still accepts an inline comment that explains the silence', () => {
    const b = { 'settings.js': 'export async function save(store, value) { await store.write(value); }\n' };
    const a = { 'settings.js': 'export async function save(store, value) {\n  try { await store.write(value); } catch (writeFailure) { /* the cache is rebuilt on next start */ }\n}\n' };
    expect(ids(check(b, a))).not.toContain('WI101');
  });
});

describe('one test timeout raised several times over (RH010)', () => {
  const test = (timeout: string) => ({ 'lock.test.ts': `it('releases the lock', async () => {\n  await acquireAndRelease();\n  expect(isLocked()).toBe(false);\n}, ${timeout});\n` });

  it('warns when a per-test timeout argument jumps to minutes', () => {
    expect(ids(check(test('200'), test('120000')))).toContain('RH010');
  });

  it('warns on mocha this.timeout raised the same way', () => {
    const b = { 'q.test.js': "it('drains', function () {\n  this.timeout(2000);\n  return drain();\n});\n" };
    const a = { 'q.test.js': "it('drains', function () {\n  this.timeout(300000);\n  return drain();\n});\n" };
    expect(ids(check(b, a))).toContain('RH010');
  });

  it('leaves a modest raise, and one under a minute', () => {
    expect(ids(check(test('20000'), test('60000')))).not.toContain('RH010');
    expect(ids(check(test('2000'), test('30000')))).not.toContain('RH010');
  });
});

describe('test step removed from a CI script (RH012)', () => {
  const script = (lines: string) => ({ 'ci/verify.sh': `#!/bin/sh\nset -eu\nnpm run build\n${lines}npm run package\n` });

  it('blocks deleting the test command from a script under ci/', () => {
    expect(ids(check(script('npm test\n'), script('')))).toContain('RH012');
  });

  it('leaves a test command that only gained a status capture', () => {
    expect(ids(check(script('npm test\n'), script('npm test || status=$?\n')))).not.toContain('RH012');
  });

  it('leaves an ordinary shell script outside the CI folders', () => {
    const b = { 'tools/dev.sh': '#!/bin/sh\nnpm test\nnpm start\n' };
    const a = { 'tools/dev.sh': '#!/bin/sh\nnpm start\n' };
    expect(ids(check(b, a))).not.toContain('RH012');
  });
});

describe('Go guard that returns a zero value with its error (WI103)', () => {
  const guarded = 'package config\nimport "fmt"\nfunc Port(n int) (int, error) {\n    if n < 1 || n > 65535 { return 0, fmt.Errorf("port out of range") }\n    return n, nil\n}\n';
  it('reports deleting it, as it does a nil-returning guard', () => {
    const after = 'package config\nfunc Port(n int) (int, error) {\n    return n, nil\n}\n';
    expect(spawnSyncWi({ 'port.go': guarded }, { 'port.go': after })).toContain('WI103');
  });
  it('leaves it rewritten with a new message', () => {
    const after = 'package config\nimport "fmt"\nfunc Port(n int) (int, error) {\n    if n < 1 || n > 65535 { return 0, fmt.Errorf("port %d is outside 1-65535", n) }\n    return n, nil\n}\n';
    expect(spawnSyncWi({ 'port.go': guarded }, { 'port.go': after })).not.toContain('WI103');
  });
});
