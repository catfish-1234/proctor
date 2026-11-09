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
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(trimmed) ??
    /^(?:ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(trimmed);
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
  init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: string },
) => Promise<{ ok: boolean; status: number; headers?: { get(name: string): string | null }; json(): Promise<unknown> }>;

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
  /** Classic branch protection could not be read (no usable token, or the read failed). While
   *  true, an empty ruleset list does NOT prove no protection: classic rules may still apply. */
  classicProtectionUnreadable: boolean;
  /** True when at least one rule came from a ruleset whose enforcement status is unknown. */
  enforcementIncomplete: boolean;
  /** True only when every relevant protection surface was affirmatively read (rulesets AND
   *  classic branch protection), so an empty result can be reported as a confirmed absence.
   *  When false, absence findings must be reported as unverified instead of missing. */
  absenceVerifiable: boolean;
}

export type ProtectionResult =
  | { kind: 'ok'; protection: BranchProtection }
  | { kind: 'unavailable'; reason: string };

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
  if (!actor || typeof actor !== 'object') return 'unknown actor type';
  if (actor.actor_type === 'RepositoryRole') {
    return `repository role id ${actor.actor_id ?? "unknown"}`;
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

interface FetchResponse {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/**
 * One GET, following redirects manually. The Authorization header is attached only to requests
 * to the original API host and is never forwarded across hosts: a cross-host redirect ends the
 * chain as unavailable rather than leaking the token. Redirects are expected in practice (GitHub
 * redirects repository endpoints after renames).
 */
async function getJson(
  opts: FetchProtectionOptions,
  base: string,
  path: string,
): Promise<{ status: number; data: unknown } | { unavailable: string }> {
  const baseHost = (() => {
    try {
      return new URL(base).host;
    } catch {
      return undefined;
    }
  })();
  let url = `${base}${path}`;
  for (let hops = 0; hops < 4; hops++) {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'proctor-doctor',
    };
    let host: string | undefined;
    try {
      host = new URL(url).host;
    } catch {
      return { unavailable: `invalid URL ${url}` };
    }
    if (opts.token && host === baseHost) headers.Authorization = `Bearer ${opts.token}`;
    let res: FetchResponse;
    opts.onRequest?.(url);
    try {
      res = (await opts.fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
        redirect: 'manual',
      })) as FetchResponse;
    } catch {
      return { unavailable: 'network request failed or timed out' };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers?.get('location');
      if (!location) return { unavailable: `redirect (${res.status}) without a Location header` };
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return { unavailable: `redirect (${res.status}) to an invalid Location` };
      }
      if (next.origin !== new URL(base).origin || next.username || next.password) {
        return { unavailable: `redirect (${res.status}) to a different host (${next.host}); not followed, so no credentials can leak` };
      }
      url = next.toString();
      continue;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    return { status: res.status, data };
  }
  return { unavailable: 'too many redirects' };
}

const HTTP_ACCESS_REASONS: Record<number, string> = {
  401: 'the token is missing or invalid',
  403: 'rate-limited or the token lacks access',
  404: 'not found or not accessible with this token',
};

function statusReason(status: number, what: string): string {
  const explanation = HTTP_ACCESS_REASONS[status];
  return `GitHub returned ${status} reading ${what}${explanation ? `; ${explanation}` : ''}`;
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
      : '';
  if (!defaultBranch) return { kind: 'unavailable', reason: 'repository metadata has no default branch' };

  const rules: RawRule[] = [];
  for (let page = 1; page <= 10; page++) {
    const rulesResp = await getJson(opts, base, `${repoPath}/rules/branches/${encodeURIComponent(defaultBranch)}?per_page=100&page=${page}`);
    if ('unavailable' in rulesResp) return { kind: 'unavailable', reason: rulesResp.unavailable };
    if (rulesResp.status !== 200 || !Array.isArray(rulesResp.data)) {
      return { kind: 'unavailable', reason: statusReason(rulesResp.status, 'branch rules') };
    }
    if (rulesResp.data.some(r => !r || typeof r !== 'object' || typeof r.type !== 'string')) {
      return { kind: 'unavailable', reason: 'branch rules response has an unsupported shape' };
    }
    rules.push(...rulesResp.data as RawRule[]);
    if (rulesResp.data.length < 100) break;
    if (page === 10) return { kind: 'unavailable', reason: 'branch rules exceed the bounded pagination limit; coverage is incomplete' };
  }

  // Enforcement and bypass actors live on the ruleset, not the rule. A ruleset in "evaluate"
  // mode logs violations without blocking, and its rules must not be reported as enforced.
  const rulesetIds = [...new Set(rules.map(r => r.ruleset_id).filter((id): id is number => typeof id === 'number'))];
  const enforcementById = new Map<number, RulesetInfo>();
  let enforcementIncomplete = rules.some(r => typeof r.ruleset_id !== 'number');
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
    if (!['active', 'evaluate', 'disabled'].includes(String(body.enforcement))) enforcementIncomplete = true;
    enforcementById.set(id, {
      id,
      enforcement: typeof body.enforcement === 'string' ? body.enforcement : 'unknown',
      bypassRoles,
    });
  }
  const isEnforced = (rule: RawRule) =>
    rule.ruleset_id !== undefined && enforcementById.get(rule.ruleset_id)?.enforcement === 'active';

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
      const checks = params?.required_status_checks;
      if (checks !== undefined && !Array.isArray(checks)) return { kind: 'unavailable', reason: 'unsupported status-check rules shape' };
      for (const c of checks ?? []) {
        if (!c || typeof c !== 'object') return { kind: 'unavailable', reason: 'unsupported status-check entry shape' };
        if (typeof c.context !== 'string' || !c.context) continue;
        if (active) requiredContexts.push(c.context);
        else if (enforcementById.get(rule.ruleset_id!)?.enforcement === 'evaluate') evaluateOnlyContexts.push(c.context);
      }
    } else if (rule.type === 'pull_request') {
      const p = rule.parameters ?? {};
      const candidate: ReviewRule = {
        requiredApprovals: typeof p.required_approving_review_count === 'number' ? p.required_approving_review_count : 0,
        requiresCodeOwnerReview: p.require_code_owner_review === true,
        requiresApprovalForUnattributedChanges: p.require_extra_approval_for_unattributed_changes === true,
      };
      if (active) {
        reviewRule = {
          requiredApprovals: Math.max(reviewRuleEnforced ? (reviewRule as ReviewRule | null)?.requiredApprovals ?? 0 : 0, candidate.requiredApprovals),
          requiresCodeOwnerReview: (reviewRuleEnforced && (reviewRule as ReviewRule | null)?.requiresCodeOwnerReview === true) || candidate.requiresCodeOwnerReview,
          requiresApprovalForUnattributedChanges: (reviewRuleEnforced && (reviewRule as ReviewRule | null)?.requiresApprovalForUnattributedChanges === true) || candidate.requiresApprovalForUnattributedChanges,
        };
        reviewRuleEnforced = true;
      } else if (!reviewRuleEnforced) reviewRule = candidate;
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
        required_status_checks?: { contexts?: unknown; checks?: { context?: unknown }[] };
        allow_deletions?: { enabled?: boolean };
        allow_force_pushes?: { enabled?: boolean };
        required_pull_request_reviews?: { required_approving_review_count?: unknown; require_code_owner_reviews?: unknown };
      };
      const contexts = Array.isArray(body.required_status_checks?.contexts) ? body.required_status_checks!.contexts! : [];
      for (const c of contexts) if (typeof c === 'string' && c && !requiredContexts.includes(c)) requiredContexts.push(c);
      if (body.required_pull_request_reviews) {
        const classicReview: ReviewRule = {
          requiredApprovals:
            typeof body.required_pull_request_reviews.required_approving_review_count === 'number'
              ? body.required_pull_request_reviews.required_approving_review_count
              : 0,
          requiresCodeOwnerReview: body.required_pull_request_reviews.require_code_owner_reviews === true,
          requiresApprovalForUnattributedChanges: false,
        };
        reviewRule = {
          requiredApprovals: Math.max(reviewRuleEnforced ? (reviewRule as ReviewRule | null)?.requiredApprovals ?? 0 : 0, classicReview.requiredApprovals),
          requiresCodeOwnerReview: (reviewRuleEnforced && (reviewRule as ReviewRule | null)?.requiresCodeOwnerReview === true) || classicReview.requiresCodeOwnerReview,
          requiresApprovalForUnattributedChanges: reviewRuleEnforced && (reviewRule as ReviewRule | null)?.requiresApprovalForUnattributedChanges === true,
        };
        reviewRuleEnforced = true;
      }
      // Partial/malformed bodies can establish positive observations, never complete absence.
      if (!Object.hasOwn(body, 'required_status_checks') || !Object.hasOwn(body, 'required_pull_request_reviews') ||
          typeof body.allow_deletions?.enabled !== 'boolean' || typeof body.allow_force_pushes?.enabled !== 'boolean') {
        classicProtectionUnreadable = true;
      }
      if (body.allow_deletions?.enabled === false) deletionProtected = true;
      if (body.allow_force_pushes?.enabled === false) forcePushProtected = true;
      for (const check of body.required_status_checks?.checks ?? []) {
        if (typeof check.context === 'string' && !requiredContexts.includes(check.context)) requiredContexts.push(check.context);
      }
    } else if (!('unavailable' in classic) && classic.status === 404) {
      // A 404 can also mask insufficient token scope; do not claim complete absence.
      classicProtectionUnreadable = true;
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
      absenceVerifiable: !classicProtectionUnreadable && !enforcementIncomplete,
    },
  };
}
