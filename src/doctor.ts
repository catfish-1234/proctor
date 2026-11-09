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

interface WorkflowHit {
  file: string;
  /** false when proctor is invoked only inside a job or step disabled with `if: false`. */
  enabled: boolean;
}

/**
 * Invocation-level detection: a workflow counts when a job actually invokes proctor
 * (`uses: ...proctor...` or a `proctor check` run command) in a job/step that is not disabled.
 * Comments, the workflow's `name:`, and incidental mentions do not count. This is still a
 * presence-only parse of one file - it cannot tell whether the job runs on pull requests, is
 * pinned, or is required - and the item detail says so.
 */
function workflowFileRunsProctor(path: string): { enabled: boolean } | undefined {
  let lines: string[];
  try {
    lines = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\s+#.*$/, ''));
  } catch {
    return undefined;
  }
  const jobsIdx = lines.findIndex(l => l.trim() === 'jobs:');
  if (jobsIdx < 0) return undefined;
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const jobStarts: number[] = [];
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trim()) continue;
    const indent = indentOf(l);
    if (indent === 0) break; // left the jobs: block
    if (indent === 2 && !l.trim().startsWith('-') && l.trim().endsWith(':')) jobStarts.push(i);
  }
  const invokesProctor = (block: string[]) =>
    block.some(l => /uses:\s*\S*proctor/i.test(l) || /(?:^|[\s|])(?:[\w./-]*\/)?proctor\s+check\b/.test(l));
  const disabled = (block: string[], maxIndent: number) =>
    block.some(l => indentOf(l) <= maxIndent && /^if:\s*false\s*$/.test(l.trim()));
  let sawDisabled = false;
  for (let j = 0; j < jobStarts.length; j++) {
    const block = lines.slice(jobStarts[j]!, j + 1 < jobStarts.length ? jobStarts[j + 1]! : lines.length);
    if (disabled(block, 4)) {
      if (invokesProctor(block)) sawDisabled = true;
      continue;
    }
    const stepStarts = block.map((_l, i) => i).filter(i => block[i]!.trim().startsWith('-'));
    const steps = stepStarts.length
      ? stepStarts.map((s, k) => block.slice(s, k + 1 < stepStarts.length ? stepStarts[k + 1]! : block.length))
      : [block];
    for (const step of steps) {
      if (!invokesProctor(step)) continue;
      if (disabled(step, 99)) sawDisabled = true;
      else return { enabled: true };
    }
  }
  return sawDisabled ? { enabled: false } : undefined;
}

function workflowRunsProctor(cwd: string): WorkflowHit | undefined {
  const dir = join(cwd, '.github', 'workflows');
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => /\.(yml|yaml)$/.test(f));
  } catch {
    return undefined;
  }
  let disabledHit: { file: string; enabled: boolean } | undefined;
  for (const f of files) {
    const hit = workflowFileRunsProctor(join(dir, f));
    if (hit?.enabled) return { file: f, enabled: true };
    if (hit && !disabledHit) disabledHit = { file: f, enabled: false };
  }
  return disabledHit;
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

  const wf = workflowRunsProctor(cwd);
  items.push(wf?.enabled
    ? { name: 'CI gate', state: 'configured', detail: `.github/workflows/${wf.file} invokes proctor in an enabled job. Presence-only: this proves an invocation exists, not that it runs on every PR, is pinned or unmodified, or that anyone is required to wait for it.` }
    : wf
      ? { name: 'CI gate', state: 'missing', detail: `.github/workflows/${wf.file} invokes proctor only in a disabled job or step (if: false), so nothing runs it`, fix: 'enable the job, or add a workflow that runs proctor check --base on pull_request (see README: make the gate independent)' }
      : { name: 'CI gate', state: 'missing', detail: 'no workflow invokes proctor; every local layer above is agent-writable, so nothing independent checks a pushed diff', fix: 'add a workflow that runs proctor check --base on pull_request (see README: make the gate independent)' });

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
