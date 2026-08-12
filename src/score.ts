import { spawnSync } from 'node:child_process';
import { runGitDiff } from './diff.js';
import { classifyDiff } from './pre-classifier.js';
import { buildContext } from './context/index.js';
import { runChecks } from './engine.js';
import type { Finding } from './types.js';

/**
 * Honesty history, derived from git rather than from a log file.
 *
 * proctor already knows how to judge a diff, and every past commit is a diff, so the history is
 * recomputed from the repository instead of accumulated in a file someone has to keep. That means
 * no state to commit, no state to corrupt, and the same answer on any clone of the repo. It costs
 * one check per commit, which is why the range is bounded.
 */
export interface CommitScore {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  findings: Finding[];
  /** True when nothing error-severity fired, which is the bar the hooks enforce. */
  clean: boolean;
  /** Findings a committed approval downgraded. A commit with these passed, but not silently. */
  approved: number;
}

export interface ScoreReport {
  commits: CommitScore[];
  /** Share of scored commits with no error-severity finding, 0 to 1. Undefined when none scored. */
  honestyRate: number | undefined;
  /** Rule IDs that fired, most frequent first. */
  topRules: Array<{ rule: string; count: number }>;
  /** Commits git reported but that could not be scored, e.g. the initial commit with no parent. */
  skipped: number;
}

interface CommitRef {
  sha: string;
  subject: string;
  author: string;
}

// ASCII unit and record separators, built by char code rather than written literally so an
// editor or a copy-paste cannot silently strip them. A commit subject can contain tabs, newlines,
// and pipes, so the delimiters have to be characters it realistically cannot hold.
const FIELD = String.fromCharCode(31);
const RECORD = String.fromCharCode(30);

/** Reads the commit list newest first. Unit separators keep subjects with odd characters intact. */
export function listCommits(cwd: string, limit: number, author?: string): CommitRef[] {
  const args = ['log', `--max-count=${limit}`, `--format=%H${FIELD}%s${FIELD}%an${RECORD}`];
  if (author) args.push(`--author=${author}`);
  const result = spawnSync('git', [...args, '--end-of-options'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'git log failed');
  }
  return result.stdout
    .split(RECORD)
    .map(r => r.trim())
    .filter(Boolean)
    .map(record => {
      const [sha = '', subject = '', author2 = ''] = record.split(FIELD);
      return { sha, subject, author: author2 };
    })
    .filter(c => c.sha.length > 0);
}

/**
 * Scores one commit by checking it against its own first parent. A commit with no parent (the
 * repository's first) has no diff to judge and is reported as skipped rather than counted clean,
 * since counting it clean would flatter the rate.
 */
async function scoreCommit(cwd: string, commit: CommitRef): Promise<CommitScore | undefined> {
  const parent = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${commit.sha}^`], { cwd, encoding: 'utf8' });
  if (parent.status !== 0) return undefined;

  // Through runGitDiff, not a second inline `git diff`: that shared helper is where the
  // per-line length cap lives, and it is the systemic ReDoS bound every verifier regex relies on.
  // Scoring history over uncapped lines would run those same regexes without it.
  let raw: string, files: import('./diff.js').ParsedFile[];
  try {
    ({ raw, files } = runGitDiff(['--end-of-options', `${commit.sha}^`, commit.sha], cwd));
  } catch {
    return undefined;
  }

  const { accepted } = classifyDiff(raw, files);
  // Config is read from the commit being scored, so each commit is judged by the rules that were
  // actually in force when it landed rather than by today's config.
  const ctx = await buildContext(cwd, accepted, { configRef: commit.sha, quiet: true });
  ctx.committedDiff = true;
  const findings = await runChecks(ctx);

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    subject: commit.subject,
    author: commit.author,
    findings,
    clean: !findings.some(f => f.severity === 'error'),
    approved: findings.filter(f => f.approved).length,
  };
}

export async function buildScoreReport(
  cwd: string,
  limit: number,
  author?: string
): Promise<ScoreReport> {
  const commits = listCommits(cwd, limit, author);
  const scored: CommitScore[] = [];
  let skipped = 0;

  for (const commit of commits) {
    const score = await scoreCommit(cwd, commit);
    if (score) scored.push(score);
    else skipped++;
  }

  const counts = new Map<string, number>();
  for (const commit of scored) {
    for (const finding of commit.findings) {
      counts.set(finding.verifierId, (counts.get(finding.verifierId) ?? 0) + 1);
    }
  }

  return {
    commits: scored,
    honestyRate: scored.length === 0 ? undefined : scored.filter(c => c.clean).length / scored.length,
    topRules: [...counts.entries()]
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)),
    skipped,
  };
}
