import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectAgents } from './adapters/detect.js';
import { checkAdapterDrift } from './adapters/drift-check.js';
import { commitGateInstalled } from './hooks/unresolved.js';

/**
 * `proctor doctor` audits the enforcement chain. Every verdict is one of three states, because
 * the difference between them is the whole product:
 *
 * - missing:     the layer is not there; anyone (or any agent) can walk past it.
 * - configured:  the local file/setting exists. That proves presence only - a local hook can be
 *                edited or deleted by the same agent it watches, and a CODEOWNERS file does not
 *                prove required review is enabled.
 * - unverified:  proctor cannot check this from the working tree at all (branch protection,
 *                required status checks, who has admin). It is reported as unknown, never as
 *                healthy, with the place a human can verify it at the owning source.
 *
 * Nothing local is ever reported as an independently verified gate.
 */
export type DoctorState = 'missing' | 'configured' | 'unverified' | 'info';

export interface DoctorItem {
  name: string;
  state: DoctorState;
  detail: string;
  fix?: string;
}

function fileContains(path: string, needle: RegExp): boolean {
  try {
    return needle.test(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
}

function preCommitPath(cwd: string): string | undefined {
  const candidates = [join(cwd, '.husky', 'pre-commit'), join(cwd, '.git', 'hooks', 'pre-commit')];
  return candidates.find(p => existsSync(p));
}

function codeownersContent(cwd: string): string | undefined {
  for (const p of [join(cwd, '.github', 'CODEOWNERS'), join(cwd, 'CODEOWNERS'), join(cwd, 'docs', 'CODEOWNERS')]) {
    try {
      return readFileSync(p, 'utf8');
    } catch { /* try next */ }
  }
  return undefined;
}

function workflowMentionsProctor(cwd: string): string | undefined {
  const dir = join(cwd, '.github', 'workflows');
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => /\.(yml|yaml)$/.test(f));
  } catch {
    return undefined;
  }
  for (const f of files) {
    // Match on any mention: the published action (`uses: catfish-1234/proctor@v1`), a self-hosted
    // composite action invoked by path, or a bare `proctor check` run step.
    if (fileContains(join(dir, f), /proctor/i)) return f;
  }
  return undefined;
}

export async function runDoctor(cwd: string): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [];
  const agents = await detectAgents(cwd);
  const deployed = agents.filter(a => existsSync(join(cwd, a.relativePath)));
  const canonical = readFileSync(fileURLToPath(new URL('../src/skill/SKILL.md', import.meta.url)), 'utf8');
  const { drifted } = await checkAdapterDrift(cwd, canonical);

  items.push(deployed.length === 0
    ? { name: 'Ruleset', state: 'missing', detail: 'no agent ruleset deployed in this repo', fix: 'proctor setup' }
    : drifted.length > 0
      ? { name: 'Ruleset', state: 'missing', detail: `deployed ruleset drifted from canonical: ${drifted.join(', ')}`, fix: 'proctor setup' }
      : { name: 'Ruleset', state: 'configured', detail: `${deployed.length} agent adapter(s) deployed, no drift. Configured, not verified: an agent can edit its own rules file.` });

  const hook = preCommitPath(cwd);
  const hookHasCheck = hook !== undefined && fileContains(hook, /proctor/i);
  items.push(hookHasCheck
    ? { name: 'Pre-commit hook', state: 'configured', detail: `${hook} runs proctor. Configured, not verified: a local hook is agent-writable.` }
    : { name: 'Pre-commit hook', state: 'missing', detail: hook ? `${hook} exists but does not run proctor` : 'no pre-commit hook runs proctor', fix: 'proctor install-hook' });

  items.push(commitGateInstalled(cwd)
    ? { name: 'Unresolved gate', state: 'configured', detail: 'pre-commit hook gates on unresolved Stop-hook findings' }
    : { name: 'Unresolved gate', state: 'missing', detail: hookHasCheck ? 'hook predates the unresolved gate' : 'no gate without a pre-commit hook', fix: 'proctor install-hook' });

  for (const agent of agents) {
    if (agent.id === 'claude-code') {
      const p = join(cwd, '.claude', 'settings.json');
      items.push(fileContains(p, /proctor[\s\S]*stop-hook|stop-hook/)
        ? { name: 'Stop hook (Claude Code)', state: 'configured', detail: `${p} runs the Stop hook` }
        : { name: 'Stop hook (Claude Code)', state: 'missing', detail: 'Claude Code detected but no Stop hook installed', fix: 'proctor setup' });
    }
    if (agent.id === 'codex') {
      const p = join(cwd, '.codex', 'hooks.json');
      items.push(fileContains(p, /proctor/)
        ? { name: 'Stop hook (Codex CLI)', state: 'configured', detail: `${p} runs the Stop hook` }
        : { name: 'Stop hook (Codex CLI)', state: 'missing', detail: 'Codex CLI detected but no Stop hook installed', fix: 'proctor setup' });
    }
    if (agent.id === 'gemini-cli') {
      const p = join(cwd, '.gemini', 'settings.json');
      items.push(fileContains(p, /proctor/)
        ? { name: 'AfterAgent hook (Gemini CLI)', state: 'configured', detail: `${p} runs the experimental AfterAgent hook` }
        : { name: 'AfterAgent hook (Gemini CLI)', state: 'info', detail: 'experimental, opt-in only; not installed', fix: 'proctor setup --agents gemini-cli' });
    }
  }

  const wf = workflowMentionsProctor(cwd);
  items.push(wf
    ? { name: 'CI gate', state: 'configured', detail: `.github/workflows/${wf} runs proctor. Configured, not verified: this proves the file exists, not that it runs on every PR, nor that anyone is required to wait for it.` }
    : { name: 'CI gate', state: 'missing', detail: 'no workflow runs proctor; every local layer above is agent-writable, so nothing independent checks a pushed diff', fix: 'add a workflow that runs proctor check --base on pull_request (see README: make the gate independent)' });

  const owners = codeownersContent(cwd);
  const coversWorkflows = (owners ?? '').split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .some(l => /(^|\/)\.github(\/|$)/.test(l.trim().split(/\s+/)[0] ?? ''));
  items.push(coversWorkflows
    ? { name: 'CODEOWNERS over .github', state: 'configured', detail: 'a CODEOWNERS rule covers .github. Configured, not verified: a CODEOWNERS file does not prove required review is enabled - that is a repository setting.' }
    : { name: 'CODEOWNERS over .github', state: 'missing', detail: 'nothing in CODEOWNERS covers .github, so a workflow-weakening PR needs no specific reviewer', fix: 'add "/.github/ @<owner>" to CODEOWNERS AND require review from code owners in repo settings' });

  items.push({
    name: 'Branch protection',
    state: 'unverified',
    detail: 'cannot be checked from the working tree. Verify at the owning source (repo Settings > Branches) that the proctor check is a required status check and that the agent\'s credentials cannot edit repo settings or bypass the rule. Until then the gate is configured at best, not independent.',
  });

  return items;
}
