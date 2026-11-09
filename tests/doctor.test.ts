import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'dist/cli.js');
let dir: string;
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proctor-doctor-'));
  const result = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const WORKFLOW = 'name: proctor\non: [pull_request]\njobs:\n  proctor:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n      - uses: catfish-1234/proctor@v1\n';

describe('proctor doctor', () => {
  it('reports every layer as missing in a fresh repo and exits 1', () => {
    const result = run('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('MISSING');
    expect(result.stdout).toContain('Ruleset');
    expect(result.stdout).toContain('CI gate');
    expect(result.stdout).toContain('UNVERIFIED');
    expect(result.stdout).toContain('Branch protection');
  });

  it('reports a fully set-up repo as configured, never as verified, and exits 0', () => {
    expect(run('setup', '--agents', 'claude-code').status).toBe(0);
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'proctor.yml'), WORKFLOW);
    writeFileSync(join(dir, '.github', 'CODEOWNERS'), '/.github/ @someone\n');
    const result = run('doctor');
    expect(result.status).toBe(0);
    for (const layer of ['Ruleset', 'Pre-commit hook', 'Unresolved gate', 'Stop hook (Claude Code)', 'CI gate', 'CODEOWNERS']) {
      expect(result.stdout).toContain(`CONFIGURED  ${layer}`);
    }
    expect(result.stdout).toContain('UNVERIFIED  Branch protection');
    // Configured layers must carry their caveat: presence is not independence.
    expect(result.stdout).not.toContain('independently verified');
    expect(result.stdout).toContain('Configured, not verified');
  });

  it('flags a drifted ruleset as missing and fails', () => {
    expect(run('setup', '--agents', 'claude-code').status).toBe(0);
    const skill = join(dir, '.claude', 'skills', 'proctor', 'SKILL.md');
    appendFileSync(skill, '\nExtra instruction proctor never wrote.\n');
    const result = run('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/MISSING\s+Ruleset/);
    expect(readFileSync(skill, 'utf8')).toContain('Extra instruction'); // doctor changes nothing
  });

  it('treats a CODEOWNERS file that does not cover .github as missing', () => {
    writeFileSync(join(dir, 'CODEOWNERS'), '/src/ @someone\n');
    const result = run('doctor');
    expect(result.stdout).toMatch(/MISSING\s+CODEOWNERS/);
  });

  it('detects a proctor workflow under either .yml or .yaml', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'checks.yaml'), WORKFLOW);
    const result = run('doctor');
    expect(result.stdout).toMatch(/CONFIGURED\s+CI gate/);
  });
});
