import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectAgents } from './adapters/detect.js';
import { checkAdapterDrift } from './adapters/drift-check.js';
import { commitGateInstalled } from './hooks/unresolved.js';
import { fetchBranchProtection, originRemoteUrl, parseGitHubRemote } from './github-rules.js';
import type { BranchProtection, FetchLike } from './github-rules.js';

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
 * Nothing local is ever reported as an independently verified gate. When the repository has a
 * GitHub remote, the doctor can ask the owning source (read-only GET requests for branch rules
 * and ruleset configuration) and report server-verified configuration - still not proof of
 * agent-independent enforcement, because an agent with admin or settings write access could
 * change or bypass server-side rules, and the doctor cannot check the agent's credentials.
 */
export type DoctorState = 'missing' | 'configured' | 'unverified' | 'info' | 'server';

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

export interface DoctorOptions {
  /** Skip all network access; server-side layers report unverified instead. */
  offline?: boolean;
  /** Test seam: fetch implementation. Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Test seam: environment for token lookup and the API base override. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: origin remote URL. Defaults to `git remote get-url origin` in cwd. */
  originUrl?: string | undefined;
}

/** Job keys from every workflow file (top-level entries under jobs:), for context-name matching. */
function workflowJobNames(cwd: string): Set<string> {
  const names = new Set<string>();
  const dir = join(cwd, '.github', 'workflows');
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => /\.(yml|yaml)$/.test(f));
  } catch {
    return names;
  }
  for (const f of files) {
    let lines: string[];
    try {
      lines = readFileSync(join(dir, f), 'utf8').split('\n');
    } catch {
      continue;
    }
    const jobsIdx = lines.findIndex(l => l.trim() === 'jobs:');
    if (jobsIdx < 0) continue;
    for (let i = jobsIdx + 1; i < lines.length; i++) {
      const l = lines[i]!.replace(/\s+#.*$/, '');
      if (!l.trim()) continue;
      const indent = l.length - l.trimStart().length;
      if (indent === 0) break;
      if (indent === 2 && !l.trim().startsWith('-') && l.trim().endsWith(':')) {
        names.add(l.trim().slice(0, -1));
      }
    }
  }
  return names;
}

function serverItems(p: BranchProtection, caveats: string[]): DoctorItem[] {
  const items: DoctorItem[] = [];
  const caveat = caveats.join(' ');
  if (p.requiredContexts.length > 0) {
    const proctorCtx = p.requiredContexts.filter(c => /proctor/i.test(c));
    items.push({
      name: 'Required status checks (server)',
      state: 'server',
      detail:
        `GitHub requires status checks on ${p.defaultBranch}: ${p.requiredContexts.join(', ')}. ` +
        (proctorCtx.length > 0
          ? `A proctor-identifiable gate is among them (${proctorCtx.join(', ')}). `
          : 'None of these names is identifiable as the proctor gate. Context names are chosen by each workflow - including reusable workflows and external apps proctor cannot enumerate - so that is not proof the gate is unrequired; compare with the workflow job that runs proctor. ') +
        (p.evaluateOnlyContexts.length > 0
          ? `Required only in evaluate mode (logged, NOT enforced): ${p.evaluateOnlyContexts.join(', ')}. `
          : '') +
        caveat,
    });
  } else if (p.evaluateOnlyContexts.length > 0) {
    items.push({
      name: 'Required status checks (server)',
      state: 'configured',
      detail: `GitHub lists required status checks on ${p.defaultBranch} only in evaluate mode (logged, NOT enforced): ${p.evaluateOnlyContexts.join(', ')}. A failing proctor run blocks nothing until the ruleset is set to Active. ` + caveat,
      fix: 'repo Settings > Rules: set the ruleset enforcement to Active',
    });
  } else {
    items.push({
      name: 'Required status checks (server)',
      state: 'missing',
      detail: `GitHub confirms no status checks are required on ${p.defaultBranch} (server-verified). A failing proctor run blocks nothing until a check is required. ` + caveat,
      fix: 'repo Settings > Rules: require the proctor check context on the default branch',
    });
  }
  if (p.reviewRule && p.reviewRuleEnforced) {
    const r = p.reviewRule;
    items.push({
      name: 'Review requirement (server)',
      state: 'server',
      detail:
        `GitHub requires review before merge on ${p.defaultBranch}: ` +
        `${r.requiredApprovals} approval(s)${r.requiresCodeOwnerReview ? ', code-owner review' : ''}` +
        `${r.requiresApprovalForUnattributedChanges ? ', approval for unattributed (agent-authored) changes' : ''}. ` +
        caveat,
    });
  } else if (p.reviewRule) {
    items.push({
      name: 'Review requirement (server)',
      state: 'configured',
      detail: `a review rule exists on ${p.defaultBranch} but its ruleset is not in active enforcement (evaluate mode logs without blocking). ` + caveat,
      fix: 'repo Settings > Rules: set the ruleset enforcement to Active',
    });
  } else {
    items.push({
      name: 'Review requirement (server)',
      state: 'missing',
      detail: `GitHub confirms no review is required before merge on ${p.defaultBranch} (server-verified): any credential with push access can land code unreviewed. ` + caveat,
      fix: 'repo Settings > Rules: require pull request review on the default branch',
    });
  }
  items.push(
    p.deletionProtected && p.forcePushProtected
      ? {
          name: 'Branch history protection (server)',
          state: 'server',
          detail: `GitHub blocks deletion and force-push of ${p.defaultBranch}, so pushed history cannot be silently rewritten. ` + caveat,
        }
      : {
          name: 'Branch history protection (server)',
          state: 'missing',
          detail: `GitHub confirms ${p.defaultBranch} can be ${!p.deletionProtected && !p.forcePushProtected ? 'deleted or force-pushed' : !p.deletionProtected ? 'deleted' : 'force-pushed'} (server-verified), so a passing gate's history is not stable. ` + caveat,
          fix: 'repo Settings > Rules: block deletions and non-fast-forward pushes on the default branch',
        },
  );
  return items;
}

export async function runDoctor(cwd: string, opts: DoctorOptions = {}): Promise<DoctorItem[]> {
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

  // Server-side verification at the owning source. Read-only GET requests for repository
  // metadata and branch rules only; nothing about the working tree leaves the machine.
  const env = opts.env ?? process.env;
  const origin = opts.originUrl !== undefined ? opts.originUrl : originRemoteUrl(cwd);
  const gh = origin !== undefined ? parseGitHubRemote(origin) : undefined;
  const manualVerify =
    'Verify at the owning source (repo Settings > Rules / Branches) that the proctor check is a required status check and that the agent\'s credentials cannot edit repo settings or bypass the rule. Until then the gate is configured at best, not independent.';
  if (opts.offline) {
    items.push({
      name: 'Branch protection',
      state: 'unverified',
      detail: `--offline: skipped the read-only GitHub lookup. ${manualVerify}`,
    });
  } else if (!gh) {
    items.push({
      name: 'Branch protection',
      state: 'unverified',
      detail: `no GitHub origin remote to verify against. ${manualVerify}`,
    });
  } else {
    let requests = 0;
    let apiHost = 'api.github.com';
    const result = await fetchBranchProtection({
      ...gh,
      token: env.GITHUB_TOKEN || env.GH_TOKEN || undefined,
      fetchImpl: opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike),
      apiBase: env.PROCTOR_GITHUB_API_BASE || undefined,
      onRequest: url => {
        requests++;
        try {
          apiHost = new URL(url).host;
        } catch { /* keep default */ }
      },
    });
    if (requests > 0) {
      items.push({
        name: 'Network access',
        state: 'info',
        detail: `doctor made ${requests} read-only request(s) to ${apiHost} for repository metadata and branch rules only. No file contents, block records, or secrets were sent. Re-run with --offline to skip.`,
      });
    }
    if (result.kind === 'unavailable') {
      items.push({
        name: 'Branch protection',
        state: 'unverified',
        detail: `could not verify at GitHub: ${result.reason}. This is unknown, not absence. ${manualVerify}`,
      });
    } else {
      const p = result.protection;
      const verifiedAt = new Date().toISOString();
      const caveats = [
        `Server-verified configuration at ${verifiedAt}, not proof of agent-independent enforcement: an agent whose credentials have admin or settings write access could change or bypass these rules, and proctor cannot see the agent's credentials.`,
      ];
      if (p.enforcementIncomplete) caveats.push('Enforcement status of at least one ruleset could not be fetched; affected rules may be less enforced than shown.');
      if (p.classicProtectionUnreadable) caveats.push('Classic branch protection, if any, was not readable (no usable token); rulesets alone are shown.');
      const bypass = p.rulesets.flatMap(rs => rs.bypassRoles.map(role => `${role} (ruleset ${rs.id})`));
      if (bypass.length > 0) caveats.push(`Bypass actors who can ignore these rules: ${bypass.join(', ')}.`);
      items.push(...serverItems(p, caveats));
      // Cross-check the local invocation detection against server requirements.
      if (p.requiredContexts.length > 0) {
        const localJobs = workflowJobNames(cwd);
        const matched = p.requiredContexts.filter(c => localJobs.has(c));
        const unmatched = p.requiredContexts.filter(c => !localJobs.has(c));
        if (matched.length > 0) {
          items.push({
            name: 'Required-context match',
            state: 'info',
            detail: `required context(s) ${matched.join(', ')} match a job name in a local workflow file.` +
              (unmatched.length > 0
                ? ` ${unmatched.join(', ')} have no matching local job name; they may come from reusable workflows, dynamic matrix names, or external apps, which proctor cannot enumerate - not proof they are unconfigured.`
                : ''),
          });
        } else if (unmatched.length > 0) {
          items.push({
            name: 'Required-context match',
            state: 'info',
            detail: `no local workflow job name matches required context(s) ${unmatched.join(', ')}. They may come from reusable workflows, dynamic matrix names, or external apps proctor cannot enumerate; if none do, the required check never reports and the merge gate hangs open or closed depending on repo settings. Verify the producing workflow by hand.`,
          });
        }
      }
    }
  }

  return items;
}
