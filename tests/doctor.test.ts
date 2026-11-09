import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'dist/cli.js');
let dir: string;
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: dir,
  encoding: 'utf8',
  // CI runners force color on; assertions match the plain words, not the escape codes.
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
});

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

  it('labels configured CI detection as presence-only', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'proctor.yml'), WORKFLOW);
    const result = run('doctor');
    expect(result.stdout).toContain('Presence-only');
  });

  it('ignores comments and incidental mentions of proctor in workflows', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'other.yml'),
      'name: proctor-notes\non: [pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "not the proctor gate"\n      # - uses: catfish-1234/proctor@v1\n');
    const result = run('doctor');
    expect(result.stdout).toMatch(/MISSING\s+CI gate/);
  });

  it('reports a workflow whose proctor job is disabled as missing', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'proctor.yml'),
      'name: proctor\non: [pull_request]\njobs:\n  proctor:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - uses: catfish-1234/proctor@v1\n');
    const result = run('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/MISSING\s+CI gate/);
    expect(result.stdout).toContain('disabled');
  });

  it('reports a workflow whose proctor step is disabled as missing', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'proctor.yml'),
      'name: proctor\non: [pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: catfish-1234/proctor@v1\n        if: false\n');
    const result = run('doctor');
    expect(result.stdout).toMatch(/MISSING\s+CI gate/);
  });
});

describe('proctor doctor server verification', () => {
  let server: import('node:http').Server;
  let apiBase: string;
  let hits: { url: string; auth?: string }[];
  let handler: (url: string) => { status: number; body: unknown };

  const RULES = [
    { type: 'deletion', ruleset_id: 7 },
    { type: 'non_fast_forward', ruleset_id: 7 },
    { type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true, require_extra_approval_for_unattributed_changes: true }, ruleset_id: 7 },
    { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'proctor' }, { context: 'checks' }] }, ruleset_id: 7 },
  ];
  const goodHandler = (url: string) => {
    if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
    if (url.includes('/rules/branches/main')) return { status: 200, body: RULES };
    if (url.endsWith('/rulesets/7')) return { status: 200, body: { enforcement: 'active', bypass_actors: [] } };
    return { status: 404, body: {} };
  };

  beforeEach(async () => {
    hits = [];
    handler = goodHandler;
    const { createServer } = await import('node:http');
    server = createServer((req, res) => {
      hits.push({ url: req.url ?? '', auth: typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined });
      const { status, body } = handler(req.url ?? '');
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    apiBase = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/o/r.git'], { cwd: dir });
  });
  afterEach(() => new Promise<void>(r => server.close(() => r())));

  // The stub server lives in this process, so the CLI must be spawned async: a spawnSync
  // would freeze the event loop and deadlock the very server the CLI is waiting on.
  const runApi = (...args: string[]) => runAsync(args, { PROCTOR_GITHUB_API_BASE: apiBase, GITHUB_TOKEN: '', GH_TOKEN: '' });

  const runAsync = (args: string[], extraEnv: Record<string, string>) => new Promise<{ status: number | null; stdout: string }>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...extraEnv },
    });
    let stdout = '';
    child.stdout.on('data', d => { stdout += d; });
    child.on('error', rejectPromise);
    child.on('close', status => resolvePromise({ status, stdout }));
  });

  it('reports server-verified rules from the owning source and discloses the network access', async () => {
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/SERVER-OK\s+Required status checks \(server\)/);
    expect(result.stdout).toContain('proctor');
    expect(result.stdout).toMatch(/SERVER-OK\s+Review requirement \(server\)/);
    expect(result.stdout).toContain('agent-authored');
    expect(result.stdout).toMatch(/SERVER-OK\s+Branch history protection \(server\)/);
    expect(result.stdout).toContain('Server-verified configuration');
    expect(result.stdout).toContain('not proof of agent-independent enforcement');
    expect(result.stdout).toMatch(/INFO\s+Network access/);
    expect(result.stdout).toContain('read-only request');
    expect(result.stdout).not.toContain('Bearer');
  });

  it('sends an existing GITHUB_TOKEN and never prints it', async () => {
    const result = await runAsync(['doctor'], { PROCTOR_GITHUB_API_BASE: apiBase, GITHUB_TOKEN: 'secret-token-value' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.auth).toBe('Bearer secret-token-value');
    expect(result.stdout).not.toContain('secret-token-value');
    // classic protection endpoint also queried when a token exists
    expect(hits.some(h => h.url.includes('/branches/main/protection'))).toBe(true);
  });

  it('reports API failure as unverified, never as missing protection', async () => {
    handler = () => ({ status: 403, body: {} });
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch protection/);
    expect(result.stdout).toContain('403');
    expect(result.stdout).toContain('unknown, not absence');
    expect(result.stdout).not.toMatch(/MISSING\s+Required status checks/);
  });

  it('reports an unreachable API as unverified', async () => {
    apiBase = 'http://127.0.0.1:1';
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch protection/);
    expect(result.stdout).not.toMatch(/MISSING\s+Required status checks/);
  });

  it('reports a server-confirmed absence of rules as missing', async () => {
    handler = (url: string) => {
      if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
      if (url.includes('/rules/branches/main')) return { status: 200, body: [] };
      return { status: 404, body: {} };
    };
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/MISSING\s+Required status checks \(server\)/);
    expect(result.stdout).toMatch(/MISSING\s+Review requirement \(server\)/);
    expect(result.stdout).toMatch(/MISSING\s+Branch history protection \(server\)/);
  });

  it('downgrades evaluate-mode rulesets to not-enforced', async () => {
    handler = (url: string) => {
      if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
      if (url.includes('/rules/branches/main')) return { status: 200, body: RULES };
      if (url.endsWith('/rulesets/7')) return { status: 200, body: { enforcement: 'evaluate', bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5 }] } };
      return { status: 404, body: {} };
    };
    const result = await runApi('doctor');
    expect(result.stdout).toContain('evaluate mode (logged, NOT enforced)');
    expect(result.stdout).toMatch(/CONFIGURED\s+Review requirement \(server\)/);
    expect(result.stdout).toContain('Bypass actors');
    expect(result.stdout).toContain('repository role Admin');
  });

  it('--offline skips all network access and reports unverified', async () => {
    const result = await runApi('doctor', '--offline');
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch protection/);
    expect(result.stdout).toContain('--offline');
    expect(hits).toHaveLength(0);
  });

  it('uses only github.com remotes', async () => {
    spawnSync('git', ['remote', 'set-url', 'origin', 'https://evil.example.com/o/r.git'], { cwd: dir });
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch protection/);
    expect(hits).toHaveLength(0);
  });
});
