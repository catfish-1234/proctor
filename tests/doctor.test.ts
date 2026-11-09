import { runDoctor } from '../src/doctor.js';
import { fetchBranchProtection } from '../src/github-rules.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
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

describe('local doctor invocation detection', () => {
  it('detects self-use ./ and quoted dist CLI command', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@kavishdua/proctor' }));
    writeFileSync(join(dir, 'action.yml'), 'name: proctor\nruns:\n  using: composite\n  steps:\n    - run: node "${{ github.action_path }}/dist/cli.js" check --ci\n');
    writeFileSync(join(dir, '.github', 'workflows', 'gate.yml'), 'jobs:\n  scan:\n    steps:\n      - uses: ./\n');
    expect(run('doctor').stdout).toMatch(/CONFIGURED\s+CI gate/);
  });
  it('ignores echo text with command-looking words', () => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'noise.yml'), 'jobs:\n  test:\n    steps:\n      - run: echo "proctor check"\n');
    expect(run('doctor').stdout).toMatch(/MISSING\s+CI gate/);
  });
});

describe('proctor doctor server verification', () => {
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

  beforeEach(() => {
    hits = [];
    handler = goodHandler;
    spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/o/r.git'], { cwd: dir });
  });
  const runApi = async (...args: string[]) => runAsync(args, { GITHUB_TOKEN: '', GH_TOKEN: '' });
  const runAsync = async (args: string[], env: Record<string, string>) => {
    const items = await runDoctor(dir, {
      github: true, offline: args.includes('--offline'), env,
      fetchImpl: async (url, init) => {
        hits.push({ url, auth: init?.headers?.Authorization });
        const { status, body } = handler(url);
        return { ok: status === 200, status, json: async () => body };
      },
    });
    return { stdout: items.map(i => `${i.state === 'server' ? 'SERVER-OK' : i.state.toUpperCase()}  ${i.name}: ${i.detail}`).join('\n') };
  };

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
    const result = await runAsync(['doctor'], { GITHUB_TOKEN: 'secret-token-value' });
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
    const items = await runDoctor(dir, { github: true, env: {}, fetchImpl: async () => { throw new Error('unreachable'); } });
    const result = { stdout: items.map(i => `${i.state.toUpperCase()}  ${i.name}`).join('\n') };
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch protection/);
    expect(result.stdout).not.toMatch(/MISSING\s+Required status checks/);
  });

  it('reports empty rules as unverified when classic protection is unreadable', async () => {
    handler = (url: string) => {
      if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
      if (url.includes('/rules/branches/main')) return { status: 200, body: [] };
      return { status: 404, body: {} };
    };
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/UNVERIFIED\s+Required status checks \(server\)/);
    expect(result.stdout).toMatch(/UNVERIFIED\s+Review requirement \(server\)/);
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch history protection \(server\)/);
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
    expect(result.stdout).toContain('repository role id 5');
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
  it('does not request GitHub unless --github is explicitly selected', async () => {
    const items = await runDoctor(dir, { env: {}, fetchImpl: async () => { throw new Error('must not call'); } });
    expect(items.find(i => i.name === 'Branch protection')?.state).toBe('unverified');
    expect(hits).toHaveLength(0);
    expect(run('doctor', '--help').stdout).toContain('--github');
  });

  it('does not forward Authorization to a different host or downgraded protocol', async () => {
    for (const destination of ['https://evil.example/api', 'http://api.github.com/repos/o/r']) {
      const calls: string[] = [];
      const result = await fetchBranchProtection({ owner: 'o', repo: 'r', token: 'test-only', fetchImpl: async (url, init) => {
        calls.push(url);
        expect(init?.redirect).toBe('manual');
        return { ok: false, status: 302, headers: { get: () => destination }, json: async () => ({}) };
      } });
      expect(result.kind).toBe('unavailable');
      expect(calls).toEqual(['https://api.github.com/repos/o/r']);
    }
  });

  it('unknown ruleset enforcement is unverified, never evaluate-only or missing', async () => {
    handler = url => url.endsWith('/rulesets/7') ? { status: 403, body: {} } : goodHandler(url);
    const result = await runAsync(['doctor'], { GITHUB_TOKEN: 'test-only' });
    expect(result.stdout).toMatch(/UNVERIFIED\s+Required status checks/);
    expect(result.stdout).not.toContain('only in evaluate mode');
  });

  it('recognizes self-use action and describes transitive needs without asserting enforcement', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@kavishdua/proctor' }));
    writeFileSync(join(dir, 'action.yml'), 'name: proctor\nruns:\n  using: composite\n  steps:\n    - run: node "${{ github.action_path }}/dist/cli.js" check --ci\n');
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'gate.yml'), 'jobs:\n  scan:\n    steps:\n      - uses: ./\n  middle:\n    needs: [scan]\n    steps:\n      - run: echo done\n  checks:\n    needs: [middle]\n    steps:\n      - run: echo done\n');
    const result = await runApi('doctor');
    expect(result.stdout).toMatch(/CONFIGURED\s+CI gate/);
    expect(result.stdout).toContain('dependency closure');
    expect(result.stdout).toContain('needs alone does not prove failure propagation');
    expect(result.stdout).toMatch(/UNVERIFIED\s+Required-context match/);
  });

  it('marks absence missing only when classic protection is successfully read too', async () => {
    handler = url => {
      if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
      if (url.includes('/rules/branches/main')) return { status: 200, body: [] };
      if (url.endsWith('/branches/main/protection')) return { status: 200, body: { required_status_checks: null, required_pull_request_reviews: null, allow_deletions: { enabled: true }, allow_force_pushes: { enabled: true } } };
      return { status: 404, body: {} };
    };
    const result = await runAsync(['doctor'], { GITHUB_TOKEN: 'test-only' });
    expect(result.stdout).toMatch(/MISSING\s+Required status checks/);
    expect(result.stdout).toMatch(/MISSING\s+Review requirement/);
    expect(result.stdout).toMatch(/MISSING\s+Branch history protection/);
  });

  it('a masked classic-protection 404 is not absence', async () => {
    handler = url => {
      if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
      if (url.includes('/rules/branches/main')) return { status: 200, body: [] };
      return { status: 404, body: {} };
    };
    const result = await runAsync(['doctor'], { GITHUB_TOKEN: 'test-only' });
    expect(result.stdout).toMatch(/UNVERIFIED\s+Required status checks/);
  });

  it('combines classic review with an evaluate-only ruleset instead of losing the enforced rule', async () => {
    handler = url => {
      if (url.endsWith('/rulesets/7')) return { status: 200, body: { enforcement: 'evaluate', bypass_actors: [] } };
      if (url.endsWith('/branches/main/protection')) return { status: 200, body: {
        required_status_checks: { contexts: ['classic-gate'] },
        required_pull_request_reviews: { required_approving_review_count: 2, require_code_owner_reviews: true },
        allow_deletions: { enabled: false }, allow_force_pushes: { enabled: false },
      } };
      return goodHandler(url);
    };
    const result = await runAsync(['doctor'], { GITHUB_TOKEN: 'test-only' });
    expect(result.stdout).toMatch(/SERVER-OK\s+Review requirement/);
    expect(result.stdout).toContain('2 approval(s), code-owner review');
    expect(result.stdout).toContain('classic-gate');
    expect(result.stdout).toMatch(/SERVER-OK\s+Branch history protection/);
  });

  it('a partial successful classic response does not prove absence', async () => {
    handler = url => {
      if (url.endsWith('/repos/o/r')) return { status: 200, body: { default_branch: 'main' } };
      if (url.includes('/rules/branches/main')) return { status: 200, body: [] };
      if (url.endsWith('/branches/main/protection')) return { status: 200, body: {} };
      return { status: 404, body: {} };
    };
    const result = await runAsync(['doctor'], { GITHUB_TOKEN: 'test-only' });
    expect(result.stdout).toMatch(/UNVERIFIED\s+Required status checks/);
    expect(result.stdout).toMatch(/UNVERIFIED\s+Branch history protection/);
  });

});
