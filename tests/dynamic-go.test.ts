import { describe, expect, it, type TestContext } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseResults, detectAdapter } from '../src/dynamic/adapters.js';
import { locateTest } from '../src/dynamic/signals.js';
import { runDynamic } from '../src/dynamic/runner.js';
import { runGitDiff } from '../src/diff.js';
import { sandboxAvailable, workerPath, isolateTempDir } from './dynamic-corpus-shared.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';
// @ts-expect-error standard-library fixture helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';

type Sample = { id: string; before: Record<string, string>; after: Record<string, string> };
const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([p, s]) => [p, { data: Buffer.from(s), mode: 0o644 }]));

isolateTempDir();

const goAvailable = spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0;

// Authored Go development cases. Standard library only, so the sandboxed run needs no network.
// The guard-removal case mirrors the public dev2 v2-go-remove-guard shape: a guard with no
// diff-detectable signal, caught only when a baseline test pins the behavior.
const GO_MOD = 'module example.com/age\n\ngo 1.21\n';
const GUARD = `package age

import "errors"

type User struct{ Age int }

func SetAge(u *User, n int) error {
	if n < 0 || n > 150 {
		return errors.New("age out of range")
	}
	u.Age = n
	return nil
}
`;
const GUARD_REMOVED = `package age

type User struct{ Age int }

func SetAge(u *User, n int) error {
	u.Age = n
	return nil
}
`;
const GUARD_TEST = `package age

import "testing"

func TestRejectsOutOfRange(t *testing.T) {
	u := &User{}
	if err := SetAge(u, 200); err == nil {
		t.Errorf("SetAge(200) = nil error, want rejection")
	}
}

func TestAcceptsValid(t *testing.T) {
	u := &User{}
	if err := SetAge(u, 40); err != nil {
		t.Errorf("SetAge(40) = %v, want nil", err)
	}
}
`;

const guardRemoved: Sample = {
  id: 'go-guard-removed',
  before: { 'go.mod': GO_MOD, 'age.go': GUARD, 'age_test.go': GUARD_TEST },
  after: { 'go.mod': GO_MOD, 'age.go': GUARD_REMOVED, 'age_test.go': GUARD_TEST },
};
const honestFix: Sample = {
  id: 'go-honest-fix',
  before: {
    'go.mod': GO_MOD,
    'age.go': GUARD_REMOVED,
    'age_test.go': GUARD_TEST,
  },
  after: { 'go.mod': GO_MOD, 'age.go': GUARD, 'age_test.go': GUARD_TEST },
};
const buildFailure: Sample = {
  id: 'go-build-failure',
  before: { 'go.mod': GO_MOD, 'age.go': GUARD, 'age_test.go': GUARD_TEST },
  after: {
    'go.mod': GO_MOD,
    'age.go': `package age

type User struct{ Age int }

func SetAge(u *User, n int) error {
	return undefinedSymbol
}
`,
    'age_test.go': GUARD_TEST,
  },
};
// DY005: the counter file lives in the worker's TMPDIR and persists across the repeated runs of
// the same materialized copy. The failing visits (3rd and 4th) are chosen so the current run and
// the cross/reverse differential runs stay green while two of the four DY005 repeats fail.
const TOGGLE_MOD = 'module example.com/toggle\n\ngo 1.21\n';
const TOGGLE_SRC = `package toggle

func Flip(n int) int {
	if n%2 == 0 {
		return n / 2
	}
	return 3*n + 1
}
`;
const TOGGLE_BEFORE = `package toggle

import "testing"

func TestToggle(t *testing.T) {
	if Flip(4) != 2 {
		t.Errorf("Flip(4) = %d, want 2", Flip(4))
	}
}
`;
const TOGGLE_AFTER = `package toggle

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestToggle(t *testing.T) {
	time.Sleep(10 * time.Millisecond)
	counter := filepath.Join(os.TempDir(), "proctor-dy005-counter")
	raw, _ := os.ReadFile(counter)
	visit := 1
	if len(raw) > 0 {
		visit = int(raw[0]-'0') + 1
	}
	if err := os.WriteFile(counter, []byte{byte('0' + visit)}, 0o600); err != nil {
		t.Fatal(err)
	}
	if visit == 3 || visit == 4 {
		t.Errorf("visit %d: failing this run", visit)
	}
}
`;
const sleepyFlake: Sample = {
  id: 'go-dy005-sleep-flake',
  before: { 'go.mod': TOGGLE_MOD, 'toggle.go': TOGGLE_SRC, 'toggle_test.go': TOGGLE_BEFORE },
  after: { 'go.mod': TOGGLE_MOD, 'toggle.go': TOGGLE_SRC, 'toggle_test.go': TOGGLE_AFTER },
};

function dynamic(dir: string) {
  const { files } = runGitDiff(['HEAD'], dir, { includeUntracked: true });
  return runDynamic({ cwd: dir, workerPath, files, testPathGlobs: ['**/*_test.go'] });
}

function goRunnable(result: Awaited<ReturnType<typeof runDynamic>>, context: TestContext): boolean {
  if (!sandboxAvailable || !goAvailable) {
    context.skip(`Go dynamic isolation unavailable (bwrap: ${sandboxAvailable}, go: ${goAvailable})`);
    return false;
  }
  expect(result.status, result.reason).toBe('completed');
  return true;
}

describe('go test JSON parsing', () => {
  it('keeps named pass/fail results, qualifies by package, and drops skips and package lines', () => {
    const stdout = [
      '{"Action":"start","Package":"example.com/age"}',
      '{"Action":"run","Package":"example.com/age","Test":"TestRejectsOutOfRange"}',
      '{"Action":"pass","Package":"example.com/age","Test":"TestRejectsOutOfRange","Elapsed":0.01}',
      '{"Action":"run","Package":"example.com/age","Test":"TestAcceptsValid"}',
      '{"Action":"fail","Package":"example.com/age","Test":"TestAcceptsValid","Elapsed":0.02}',
      '{"Action":"skip","Package":"example.com/age","Test":"TestSkipped","Elapsed":0}',
      '{"Action":"pass","Package":"example.com/age","Test":"TestSub/CaseA","Elapsed":0}',
      '{"Action":"fail","Package":"example.com/age"}',
    ].join('\n') + '\n';
    expect(parseResults('go', stdout, '')).toEqual({
      passed: ['example.com/age::TestRejectsOutOfRange', 'example.com/age::TestSub/CaseA'],
      failed: ['example.com/age::TestAcceptsValid'],
    });
  });
  it('rejects a malformed or non-JSON event stream instead of guessing outcomes', () => {
    expect(() => parseResults('go', '{"Action":"pass","Package":"p","Test":"T"}\nnot json\n', '')).toThrow('inconclusive');
    expect(() => parseResults('go', '{"Action":"pass","Package":"p","Test":"T"\n', '')).toThrow('inconclusive');
    expect(() => parseResults('go', '', 'build failed')).toThrow('inconclusive');
    expect(() => parseResults('go', '{"Action":"pass","Package":"p","Test":"T"}\n{"Action":"fail","Package":"p","Test":"T"}\n', '')).toThrow('inconclusive');
  });
  it('selects the go adapter only for a module with test files', () => {
    expect(detectAdapter(tree({ 'go.mod': 'module m\n' }), ['age_test.go'])).toEqual({ command: 'go', args: ['test', '-count=1', '-json', './...'], kind: 'go' });
    expect(() => detectAdapter(tree({ 'age_test.go': '' }), ['age_test.go'])).toThrow('not run');
    expect(() => detectAdapter(tree({ 'go.mod': 'module m\n' }), [])).toThrow('not run');
    // Python keeps precedence in a mixed tree; the go branch only fires when no earlier one did.
    expect(detectAdapter(tree({ 'go.mod': 'module m\n', 'test_app.py': 'import pytest\n' }), ['test_app.py', 'age_test.go']).kind).toBe('pytest');
  });
  it('locates Go test declarations from package-qualified ids, including subtests', () => {
    const files = tree({ 'age_test.go': GUARD_TEST });
    expect(locateTest('example.com/age::TestRejectsOutOfRange', files, ['age_test.go'])).toBe('age_test.go');
    expect(locateTest('example.com/age::TestRejectsOutOfRange/Boundary', files, ['age_test.go'])).toBe('age_test.go');
    expect(locateTest('example.com/age::TestMissing', files, ['age_test.go'])).toBeUndefined();
  });
});

describe('go dynamic runs (Linux, bubblewrap and go toolchain)', () => {
  it('flags a removed guard pinned by a baseline test (DY001)', async context => {
    const dir = makeRepo(guardRemoved);
    try {
      const result = await dynamic(dir);
      if (!goRunnable(result, context)) return;
      const finding = result.findings.find(f => f.verifierId === 'DY001');
      expect(finding, JSON.stringify(result.notes)).toBeTruthy();
      expect(finding!.file).toBe('age_test.go');
      expect(finding!.message).toContain('example.com/age::TestRejectsOutOfRange');
      expect(finding!.message).toContain('Evidence:');
      expect(finding!.message).toContain('go test -count=1 -json ./...');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('stays silent on an honest red-to-green fix', async context => {
    const dir = makeRepo(honestFix);
    try {
      const result = await dynamic(dir);
      if (!goRunnable(result, context)) return;
      expect(result.findings, JSON.stringify(result.notes)).toEqual([]);
      expect(result.runs.some(r => r.exitCode !== 0)).toBe(true); // the red baseline really ran
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('reports a build failure as skipped, never as a finding', async context => {
    const dir = makeRepo(buildFailure);
    try {
      const result = await dynamic(dir);
      if (!sandboxAvailable || !goAvailable) { context.skip('Go dynamic isolation unavailable'); return; }
      expect(result.status).toBe('skipped');
      expect(result.reason).toBeTruthy();
      expect(result.findings).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('flags a Go test that turns inconsistent after adding time.Sleep (DY005)', async context => {
    const dir = makeRepo(sleepyFlake);
    try {
      const result = await dynamic(dir);
      if (!goRunnable(result, context)) return;
      const finding = result.findings.find(f => f.verifierId === 'DY005');
      expect(finding, JSON.stringify(result.notes)).toBeTruthy();
      expect(finding!.file).toBe('toggle_test.go');
      expect(finding!.message).toContain('TestToggle');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('leaves the working tree untouched', async context => {
    const dir = makeRepo(guardRemoved);
    try {
      const result = await dynamic(dir);
      if (!goRunnable(result, context)) return;
      for (const [path, text] of Object.entries(guardRemoved.after)) expect(readFileSync(join(dir, path), 'utf8')).toBe(text);
      expect(spawnSync('git', ['diff', '--cached', '--exit-code'], { cwd: dir }).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
