import pc from 'picocolors';
import type { ScoreReport } from '../score.js';

export interface ScoreReportOptions {
  stream?: { write(s: string): void };
  /** Show every commit, not just the ones with findings. */
  all?: boolean;
}

const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

/**
 * Renders the honesty history.
 *
 * The rate is stated with its denominator rather than on its own, because "100%" over three
 * commits and "100%" over two hundred are very different claims and the number alone hides which
 * one you are looking at.
 */
export function scoreReport(report: ScoreReport, opts?: ScoreReportOptions): void {
  const out = opts?.stream ?? process.stdout;
  const { commits, honestyRate, topRules, skipped } = report;

  if (commits.length === 0) {
    out.write('No commits to score.\n');
    if (skipped > 0) out.write(pc.dim(`${skipped} commit(s) had no parent to compare against.\n`));
    return;
  }

  // Only commits that would actually have been blocked are listed by default, plus any that
  // passed on an approval. Warnings are real, but they did not stop anything, and printing every
  // one of them buries the commits that did. `--all` opts into the full picture.
  const shown = opts?.all ? commits : commits.filter(c => !c.clean || c.approved > 0);
  if (shown.length > 0) {
    for (const commit of shown) {
      const mark = commit.clean ? pc.green('ok  ') : pc.red('flag');
      const subject = commit.subject.length > 60 ? commit.subject.slice(0, 57) + '...' : commit.subject;
      out.write(`${mark} ${pc.dim(commit.shortSha)}  ${subject}\n`);
      const relevant = opts?.all
        ? commit.findings
        : commit.findings.filter(f => f.severity === 'error' || f.approved);
      for (const finding of relevant) {
        const tag = finding.approved ? pc.cyan('approved') : finding.severity === 'error' ? pc.red('error') : pc.yellow(finding.severity);
        out.write(`       ${tag}  [${finding.verifierId}]  ${finding.file}:${finding.line}\n`);
      }
    }
    out.write('\n');
  }

  const cleanCount = commits.filter(c => c.clean).length;
  const rate = honestyRate === undefined ? 'n/a' : pct(honestyRate);
  const colored = honestyRate === undefined || honestyRate === 1 ? pc.green(rate) : honestyRate >= 0.9 ? pc.yellow(rate) : pc.red(rate);
  out.write(`Honesty rate: ${colored}  (${cleanCount} of ${commits.length} commits with no blocking finding)\n`);

  const approved = commits.reduce((n, c) => n + c.approved, 0);
  if (approved > 0) {
    out.write(pc.cyan(`${approved} finding(s) passed on a recorded approval rather than on being clean.\n`));
  }

  if (topRules.length > 0) {
    out.write('\nWhat fired:\n');
    for (const { rule, count } of topRules) {
      out.write(`  ${rule}  ${count}\n`);
    }
  }

  if (skipped > 0) {
    out.write(pc.dim(`\n${skipped} commit(s) skipped: no parent to compare against.\n`));
  }
}
