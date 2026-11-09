import { execFileSync } from 'node:child_process';

/**
 * Read-only server-side verification for `proctor doctor`.
 *
 * The local working tree cannot prove anything about server-side enforcement, so the doctor
 * asks the owning source: the GitHub API. Every request is a GET for repository metadata,
 * branch rules, or ruleset configuration. No file contents, block records, or secrets are
 * ever sent; the only credential used is a GITHUB_TOKEN/GH_TOKEN the user already has in the
 * environment, sent as an Authorization header to the API host and nowhere else.
 *
 * Honesty rules baked into the return types:
 * - Any API failure (network, auth, rate limit, a single ruleset detail call failing) is
 *   reported as unverifiable, never as absence of protection.
 * - Rules from a ruleset in "evaluate" mode are reported as logged-not-enforced.
 * - A successful answer proves server-side CONFIGURATION only. It never proves the agent
 *   lacks admin or settings write access, and callers must not upgrade it to that claim.
 */

export interface GitHubRepo {
  owner: string;
  repo: string;
}

/** Only github.com is accepted: the doctor verifies the repository's actual remote, nothing else. */
export function parseGitHubRemote(url: string): GitHubRepo | undefined {
  const trimmed = url.trim();
  const m =
    /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(trimmed) ??
    /^(?:ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (!m) return undefined;
  return { owner: m[1]!, repo: m[2]! };
}

export function originRemoteUrl(cwd: string): string | undefined {
  try {
    const out = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/** Minimal fetch shape so tests can inject a stub and the doctor can count requests. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ReviewRule {
  requiredApprovals: number;
  requiresCodeOwnerReview: boolean;
  requiresApprovalForUnattributedChanges: boolean;
}

export interface RulesetInfo {
  id: number;
  /** 'active' | 'evaluate' | 'disabled', or 'unknown' when the detail call failed. */
  enforcement: string;
  /** Bypass actor roles, named by role only (no users, teams, or apps). */
  bypassRoles: string[];
}

export interface BranchProtection {
  defaultBranch: string;
  /** Required status check contexts from ACTIVE rulesets (and classic protection when readable). */
  requiredContexts: string[];
  /** Contexts required only by evaluate-mode rulesets: logged, not enforced. */
  evaluateOnlyContexts: string[];
  reviewRule: ReviewRule | null;
  reviewRuleEnforced: boolean;
  deletionProtected: boolean;
  forcePushProtected: boolean;
  rulesets: RulesetInfo[];
  /** Classic branch protection exists but could not be read (no usable token). */
  classicProtectionUnreadable: boolean;
  /** True when at least one rule came from a ruleset whose enforcement status is unknown. */
  enforcementIncomplete: boolean;
}

export type ProtectionResult =
  | { kind: 'ok'; protection: BranchProtection }
  | { kind: 'unavailable'; reason: string };

const REPOSITORY_ROLE_NAMES: Record<number, string> = { 2: 'Maintain', 4: 'Write', 5: 'Admin' };

interface RawRule {
  type?: string;
  parameters?: Record<string, unknown>;
  ruleset_id?: number;
}

interface RawBypassActor {
  actor_type?: string;
  actor_id?: number;
}

function describeBypassActor(actor: RawBypassActor): string {
  if (actor.actor_type === 'RepositoryRole') {
    return `repository role ${REPOSITORY_ROLE_NAMES[actor.actor_id ?? -1] ?? `id ${actor.actor_id}`}`;
  }
  return actor.actor_type ?? 'unknown actor type';
}

export interface FetchProtectionOptions {
  owner: string;
  repo: string;
  token?: string;
  fetchImpl: FetchLike;
  /** Base URL override for tests; production callers leave this unset. */
  apiBase?: string;
  /** Incremented once per request so the doctor can disclose the network access it made. */
  onRequest?: (url: string) => void;
}

async function getJson(
  opts: FetchProtectionOptions,
  base: string,
  path: string,
): Promise<{ status: number; data: unknown } | { unavailable: string }> {
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'proctor-doctor',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Awaited<ReturnType<FetchLike>>;
  opts.onRequest?.(url);
  try {
    res = await opts.fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return { unavailable: `network request failed (${err instanceof Error ? err.message : String(err)})` };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  return { status: res.status, data };
}

function statusReason(status: number, what: string): string {
  if (status === 401) return `GitHub returned 401 reading ${what}; the token is missing or invalid`;
  if (status === 403) return `GitHub returned 403 reading ${what}; rate-limited or the token lacks access`;
  if (status === 404) return `GitHub returned 404 reading ${what}; the repository is private and no readable token is set, or it does not exist`;
  return `GitHub returned ${status} reading ${what}`;
}

export async function fetchBranchProtection(opts: FetchProtectionOptions): Promise<ProtectionResult> {
  const base = (opts.apiBase ?? 'https://api.github.com').replace(/\/$/, '');
  const repoPath = `/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}`;

  const meta = await getJson(opts, base, repoPath);
  if ('unavailable' in meta) return { kind: 'unavailable', reason: meta.unavailable };
  if (meta.status !== 200 || typeof meta.data !== 'object' || meta.data === null) {
    return { kind: 'unavailable', reason: statusReason(meta.status, 'repository metadata') };
  }
  const defaultBranch =
    typeof (meta.data as { default_branch?: unknown }).default_branch === 'string'
      ? ((meta.data as { default_branch: string }).default_branch || 'main')
      : 'main';

  const rulesResp = await getJson(opts, base, `${repoPath}/rules/branches/${encodeURIComponent(defaultBranch)}`);
  if ('unavailable' in rulesResp) return { kind: 'unavailable', reason: rulesResp.unavailable };
  if (rulesResp.status !== 200 || !Array.isArray(rulesResp.data)) {
    return { kind: 'unavailable', reason: statusReason(rulesResp.status, 'branch rules') };
  }
  const rules = rulesResp.data as RawRule[];

  // Enforcement and bypass actors live on the ruleset, not the rule. A ruleset in "evaluate"
  // mode logs violations without blocking, and its rules must not be reported as enforced.
  const rulesetIds = [...new Set(rules.map(r => r.ruleset_id).filter((id): id is number => typeof id === 'number'))];
  const enforcementById = new Map<number, RulesetInfo>();
  let enforcementIncomplete = false;
  for (const id of rulesetIds) {
    const detail = await getJson(opts, base, `${repoPath}/rulesets/${id}`);
    if ('unavailable' in detail || detail.status !== 200 || typeof detail.data !== 'object' || detail.data === null) {
      enforcementIncomplete = true;
      enforcementById.set(id, { id, enforcement: 'unknown', bypassRoles: [] });
      continue;
    }
    const body = detail.data as { enforcement?: unknown; bypass_actors?: unknown };
    const bypassRoles = Array.isArray(body.bypass_actors)
      ? (body.bypass_actors as RawBypassActor[]).map(describeBypassActor)
      : [];
    enforcementById.set(id, {
      id,
      enforcement: typeof body.enforcement === 'string' ? body.enforcement : 'unknown',
      bypassRoles,
    });
  }
  const isEnforced = (rule: RawRule) =>
    rule.ruleset_id === undefined || enforcementById.get(rule.ruleset_id)?.enforcement === 'active';

  const requiredContexts: string[] = [];
  const evaluateOnlyContexts: string[] = [];
  let reviewRule: ReviewRule | null = null;
  let reviewRuleEnforced = false;
  let deletionProtected = false;
  let forcePushProtected = false;
  for (const rule of rules) {
    const active = isEnforced(rule);
    if (rule.type === 'required_status_checks') {
      const params = rule.parameters as { required_status_checks?: { context?: unknown }[] } | undefined;
      for (const c of params?.required_status_checks ?? []) {
        if (typeof c.context !== 'string' || !c.context) continue;
        (active ? requiredContexts : evaluateOnlyContexts).push(c.context);
      }
    } else if (rule.type === 'pull_request') {
      const p = rule.parameters ?? {};
      reviewRule = {
        requiredApprovals: typeof p.required_approving_review_count === 'number' ? p.required_approving_review_count : 0,
        requiresCodeOwnerReview: p.require_code_owner_review === true,
        requiresApprovalForUnattributedChanges: p.require_extra_approval_for_unattributed_changes === true,
      };
      reviewRuleEnforced = reviewRuleEnforced || active;
    } else if (rule.type === 'deletion') {
      deletionProtected = deletionProtected || active;
    } else if (rule.type === 'non_fast_forward') {
      forcePushProtected = forcePushProtected || active;
    }
  }

  // Classic branch protection can coexist with rulesets. It is only readable with a token;
  // without one its absence here is not evidence of absence.
  let classicProtectionUnreadable = false;
  if (opts.token) {
    const classic = await getJson(opts, base, `${repoPath}/branches/${encodeURIComponent(defaultBranch)}/protection`);
    if (!('unavailable' in classic) && classic.status === 200 && typeof classic.data === 'object' && classic.data !== null) {
      const body = classic.data as {
        required_status_checks?: { contexts?: unknown };
        required_pull_request_reviews?: { required_approving_review_count?: unknown; require_code_owner_reviews?: unknown };
      };
      const contexts = Array.isArray(body.required_status_checks?.contexts) ? body.required_status_checks!.contexts! : [];
      for (const c of contexts) if (typeof c === 'string' && c && !requiredContexts.includes(c)) requiredContexts.push(c);
      if (body.required_pull_request_reviews && !reviewRule) {
        reviewRule = {
          requiredApprovals:
            typeof body.required_pull_request_reviews.required_approving_review_count === 'number'
              ? body.required_pull_request_reviews.required_approving_review_count
              : 0,
          requiresCodeOwnerReview: body.required_pull_request_reviews.require_code_owner_reviews === true,
          requiresApprovalForUnattributedChanges: false,
        };
        reviewRuleEnforced = true;
      }
      if (body.required_status_checks) deletionProtected = deletionProtected;
    } else if (!('unavailable' in classic) && classic.status === 404) {
      // No classic protection; rulesets above are the whole picture.
    } else {
      classicProtectionUnreadable = true;
    }
  } else {
    classicProtectionUnreadable = true;
  }

  return {
    kind: 'ok',
    protection: {
      defaultBranch,
      requiredContexts,
      evaluateOnlyContexts,
      reviewRule,
      reviewRuleEnforced,
      deletionProtected,
      forcePushProtected,
      rulesets: [...enforcementById.values()],
      classicProtectionUnreadable,
      enforcementIncomplete,
    },
  };
}
