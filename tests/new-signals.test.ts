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
