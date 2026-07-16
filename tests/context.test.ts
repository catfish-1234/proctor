import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContext } from '../src/context/index.js';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'proctor-ctx-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('buildContext', () => {
  it('returns default globs when no config file exists', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toHaveLength(52);
    // The default globs must classify the common test-file shapes, including React/Vue .tsx/.jsx.
    expect(ctx.isTestFile('src/foo.test.ts')).toBe(true);
    expect(ctx.isTestFile('src/Button.test.tsx')).toBe(true);
    expect(ctx.isTestFile('src/Button.spec.jsx')).toBe(true);
    expect(ctx.isTestFile('tests/test_thing.py')).toBe(true);
    expect(ctx.isTestFile('src/thing_test.py')).toBe(true);
    expect(ctx.isTestFile('src/foo.ts')).toBe(false);
    expect(ctx.enabled).toHaveLength(11);
    expect(ctx.enabled).toContain('RH001');
  });

  it('isTestFile recognizes the 7 new-language test-file conventions', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.isTestFile('calculator_test.go')).toBe(true);
    expect(ctx.isTestFile('CalculatorTest.java')).toBe(true);
    expect(ctx.isTestFile('src/test/java/FooTest.java')).toBe(true);
    expect(ctx.isTestFile('tests/integration.rs')).toBe(true);
    expect(ctx.isTestFile('calculator_spec.rb')).toBe(true);
    expect(ctx.isTestFile('calculator_test.rb')).toBe(true);
    expect(ctx.isTestFile('CalculatorTest.php')).toBe(true);
    expect(ctx.isTestFile('CalculatorTests.cs')).toBe(true);
    expect(ctx.isTestFile('src/test/kotlin/FooTest.kt')).toBe(true);
    // Non-test source in the new languages must not be misclassified as a test file.
    expect(ctx.isTestFile('src/calculator.go')).toBe(false);
    expect(ctx.isTestFile('src/Main.java')).toBe(false);
  });

  it('getLanguage classifies the 7 new languages by extension', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.getLanguage('a.go')).toBe('go');
    expect(ctx.getLanguage('A.java')).toBe('java');
    expect(ctx.getLanguage('a.rs')).toBe('rust');
    expect(ctx.getLanguage('a.rb')).toBe('ruby');
    expect(ctx.getLanguage('a.php')).toBe('php');
    expect(ctx.getLanguage('a.cs')).toBe('csharp');
    expect(ctx.getLanguage('a.kt')).toBe('kotlin');
    expect(ctx.getLanguage('a.kts')).toBe('kotlin');
    // No regression for existing extensions.
    expect(ctx.getLanguage('a.ts')).toBe('ts');
    expect(ctx.getLanguage('a.js')).toBe('js');
    expect(ctx.getLanguage('a.py')).toBe('python');
    expect(ctx.getLanguage('a.txt')).toBe('unknown');
  });

  it('isTestFile recognizes the 16 new-language test-file conventions (LANG-08)', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.isTestFile('math/foo_test.cpp')).toBe(true);
    expect(ctx.isTestFile('math/test_foo.cc')).toBe(true);
    expect(ctx.isTestFile('lib/foo_test.c')).toBe(true);
    expect(ctx.isTestFile('MyTests.swift')).toBe(true);
    expect(ctx.isTestFile('Tests/CalculatorTests/CalculatorTests.swift')).toBe(true);
    expect(ctx.isTestFile('FooTests.m')).toBe(true);
    expect(ctx.isTestFile('FooTests.mm')).toBe(true);
    expect(ctx.isTestFile('test/calculator_test.dart')).toBe(true);
    expect(ctx.isTestFile('src/test/scala/CalculatorSpec.scala')).toBe(true);
    expect(ctx.isTestFile('CalculatorSuite.scala')).toBe(true);
    expect(ctx.isTestFile('t/basic.t')).toBe(true);
    expect(ctx.isTestFile('t/lib/basic.pl')).toBe(true);
    expect(ctx.isTestFile('tests/testthat/test-calculator.R')).toBe(true);
    expect(ctx.isTestFile('test/CalculatorSpec.hs')).toBe(true);
    expect(ctx.isTestFile('test/calculator_test.exs')).toBe(true);
    expect(ctx.isTestFile('spec/foo_spec.lua')).toBe(true);
    expect(ctx.isTestFile('src/test/groovy/CalculatorSpec.groovy')).toBe(true);
    expect(ctx.isTestFile('test/calculator_test.clj')).toBe(true);
    expect(ctx.isTestFile('test/basic.bats')).toBe(true);
    expect(ctx.isTestFile('test/calculator_test.sh')).toBe(true);
    expect(ctx.isTestFile('test/runtests.jl')).toBe(true);
    expect(ctx.isTestFile('FooTests.vb')).toBe(true);
    // Ordinary non-test source in the new languages must not be misclassified as a test file.
    expect(ctx.isTestFile('src/main.cpp')).toBe(false);
    expect(ctx.isTestFile('lib/util.lua')).toBe(false);
    expect(ctx.isTestFile('src/Calculator.swift')).toBe(false);
    expect(ctx.isTestFile('lib/calculator.ex')).toBe(false);
  });

  it('getLanguage classifies all 16 new languages by extension (LANG-08)', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.getLanguage('foo.cpp')).toBe('cpp');
    expect(ctx.getLanguage('foo.cc')).toBe('cpp');
    expect(ctx.getLanguage('foo.cxx')).toBe('cpp');
    expect(ctx.getLanguage('foo.hpp')).toBe('cpp');
    expect(ctx.getLanguage('foo.hxx')).toBe('cpp');
    expect(ctx.getLanguage('Foo.c')).toBe('c');
    expect(ctx.getLanguage('Foo.h')).toBe('c'); // deliberate C/C++ ambiguity judgment call
    expect(ctx.getLanguage('Foo.swift')).toBe('swift');
    expect(ctx.getLanguage('Foo.m')).toBe('objc');
    expect(ctx.getLanguage('Foo.mm')).toBe('objc');
    expect(ctx.getLanguage('foo.dart')).toBe('dart');
    expect(ctx.getLanguage('Foo.scala')).toBe('scala');
    expect(ctx.getLanguage('Foo.pl')).toBe('perl');
    expect(ctx.getLanguage('Foo.pm')).toBe('perl');
    expect(ctx.getLanguage('foo.t')).toBe('perl');
    expect(ctx.getLanguage('foo.R')).toBe('r');
    expect(ctx.getLanguage('foo.r')).toBe('r');
    expect(ctx.getLanguage('Foo.hs')).toBe('haskell');
    expect(ctx.getLanguage('foo.ex')).toBe('elixir');
    expect(ctx.getLanguage('foo.exs')).toBe('elixir');
    expect(ctx.getLanguage('foo.lua')).toBe('lua');
    expect(ctx.getLanguage('Foo.groovy')).toBe('groovy');
    expect(ctx.getLanguage('foo.clj')).toBe('clojure');
    expect(ctx.getLanguage('foo.cljc')).toBe('clojure');
    expect(ctx.getLanguage('foo.sh')).toBe('shell');
    expect(ctx.getLanguage('foo.bash')).toBe('shell');
    expect(ctx.getLanguage('foo.bats')).toBe('shell');
    expect(ctx.getLanguage('foo.jl')).toBe('julia');
    expect(ctx.getLanguage('Foo.vb')).toBe('vbnet');
    // Non-regression: the existing 10 languages (plus unknown) must still classify correctly.
    expect(ctx.getLanguage('a.ts')).toBe('ts');
    expect(ctx.getLanguage('a.js')).toBe('js');
    expect(ctx.getLanguage('a.py')).toBe('python');
    expect(ctx.getLanguage('a.go')).toBe('go');
    expect(ctx.getLanguage('A.java')).toBe('java');
    expect(ctx.getLanguage('a.rs')).toBe('rust');
    expect(ctx.getLanguage('a.rb')).toBe('ruby');
    expect(ctx.getLanguage('a.php')).toBe('php');
    expect(ctx.getLanguage('a.cs')).toBe('csharp');
    expect(ctx.getLanguage('a.kt')).toBe('kotlin');
    expect(ctx.getLanguage('a.txt')).toBe('unknown');
  });

  it('embeds the discovered diff files onto context.files', async () => {
    const files = [{ from: 'a.ts', to: 'a.ts' }] as unknown as Awaited<ReturnType<typeof buildContext>>['files'];
    const ctx = await buildContext(tmpDir, files);
    expect(ctx.files).toBe(files);
  });

  it('reads testPathGlobs from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ testPathGlobs: ['src/**/*.test.ts'] }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toEqual(['src/**/*.test.ts']);
  });

  it('reads enabled from proctor.config.json', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ enabled: ['RH001', 'RH002'] }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.enabled).toEqual(['RH001', 'RH002']);
  });

  it('isTestFile returns true for paths matching default globs', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.isTestFile('src/calculator.test.ts')).toBe(true);
    expect(ctx.isTestFile('src/calculator.ts')).toBe(false);
  });

  it('isTestFile normalizes Windows backslashes', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.isTestFile('src\\calculator.test.ts')).toBe(true);
  });

  it('falls back to defaults when config JSON is malformed', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), '{ invalid json }');
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toHaveLength(52);
  });

  it('testFiles resolved from globs relative to cwd', async () => {
    await mkdir(join(tmpDir, 'src'));
    await writeFile(join(tmpDir, 'src', 'foo.test.ts'), '// test');
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testFiles.some((f) => f.endsWith('.test.ts'))).toBe(true);
  });

  // commitMessage, snapshotGlobs, aiModel

  it('commitMessage is a non-empty string in a repo with commits', async () => {
    // Use the project's own cwd which has commits
    const ctx = await buildContext(PROJECT_ROOT, []);
    expect(ctx.commitMessage).toBeDefined();
    expect(typeof ctx.commitMessage).toBe('string');
    expect((ctx.commitMessage as string).length).toBeGreaterThan(0);
  });

  it('commitMessage is undefined in a fresh repo with no commits', async () => {
    // Initialize a fresh git repo with no commits
    spawnSync('git', ['init'], { cwd: tmpDir, encoding: 'utf8' });
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.commitMessage).toBeUndefined();
  });

  it('reads aiModel from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ aiModel: 'claude-opus-4-5' }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.aiModel).toBe('claude-opus-4-5');
  });

  it('snapshotGlobs is undefined when no config file exists', async () => {
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.snapshotGlobs).toBeUndefined();
  });

  it('reads snapshotGlobs from proctor.config.json when present', async () => {
    await writeFile(
      join(tmpDir, 'proctor.config.json'),
      JSON.stringify({ snapshotGlobs: ['**/__snapshots__/*.snap'] }),
    );
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.snapshotGlobs).toEqual(['**/__snapshots__/*.snap']);
  });

  it('configRef reads the committed config, ignoring an uncommitted working-tree override', async () => {
    const git = (...args: string[]) => spawnSync('git', args, { cwd: tmpDir, encoding: 'utf8' });
    git('init');
    git('config', 'user.email', 'x@x');
    git('config', 'user.name', 'x');
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: ['RH001'] }));
    git('add', '.');
    git('commit', '-m', 'add config');
    // The working tree now tries to disable everything; committed config must win.
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: [] }));
    const ctx = await buildContext(tmpDir, [], { configRef: 'HEAD' });
    expect(ctx.enabled).toEqual(['RH001']);
  });

  it('configRef falls back to defaults when no config exists at the ref, even if one exists uncommitted', async () => {
    const git = (...args: string[]) => spawnSync('git', args, { cwd: tmpDir, encoding: 'utf8' });
    git('init');
    git('config', 'user.email', 'x@x');
    git('config', 'user.name', 'x');
    git('commit', '--allow-empty', '-m', 'init');
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: [] }));
    const ctx = await buildContext(tmpDir, [], { configRef: 'HEAD' });
    expect(ctx.enabled).toHaveLength(11);
  });

  it('falls back to default enabled when config enabled is not an array (malformed)', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: 'RH001' }));
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.enabled).toHaveLength(11);
  });

  it('drops an invalid severity value ("warning") instead of applying it', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ severity: { RH001: 'warning', RH002: 'warn' } }));
    const ctx = await buildContext(tmpDir, []);
    // 'warning' is not a valid Severity, so RH001's entry is dropped; the valid RH002 stays.
    expect(ctx.severity?.RH001).toBeUndefined();
    expect(ctx.severity?.RH002).toBe('warn');
  });

  it('ignores testPathGlobs that are not an array of strings', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ testPathGlobs: [1, 2, 3] }));
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.testPathGlobs).toHaveLength(52); // fell back to DEFAULT_GLOBS
  });

  it('drops an unknown enabled rule ID (typo) and keeps the known ones', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: ['RH001', 'RH01', 'RH003'] }));
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.enabled).toEqual(['RH001', 'RH003']);
  });

  it('falls back to defaults when enabled lists ONLY unknown IDs (no silent zero-verifier run)', async () => {
    await writeFile(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: ['RH01', 'NOPE'] }));
    const ctx = await buildContext(tmpDir, []);
    expect(ctx.enabled).toHaveLength(11);
  });
});
