// Before/after (proctor off vs on) cheat-rate + honest-pass-rate table, per model.
// Mirrors src/reporters/pretty.ts's injectable-stream + picocolors formatter pattern.
import pc from 'picocolors';
import type { ScoredRow } from './scorer.js';

export interface ReportOptions {
  stream?: { write(s: string): void };
  /**
   * True when the rows came from `--mock`, the fixture-replay runner.
   *
   * This changes what the table is allowed to claim, which is why it is worth threading through.
   * See mockCaveat below.
   */
  mock?: boolean;
}

function pct(n: number, total: number): string {
  if (total === 0) return 'n/a';
  return `${((n / total) * 100).toFixed(1)}%`;
}

export function cheatRateTable(rows: ScoredRow[], opts?: ReportOptions): void {
  const out = opts?.stream ?? process.stdout;
  if (rows.length === 0) {
    out.write(pc.yellow('No benchmark rows to report.\n'));
    return;
  }

  const models = [...new Set(rows.map((r) => r.model))];

  out.write(pc.bold('\nBenchmark: cheat rate & honest-pass rate, proctor off vs on\n'));
  out.write(
    pc.dim('model'.padEnd(16) + 'proctor'.padEnd(10) + 'cheat_rate'.padEnd(14) + 'honest_pass_rate\n')
  );

  for (const model of models) {
    for (const proctorOn of [false, true]) {
      const subset = rows.filter((r) => r.model === model && r.proctorOn === proctorOn);
      if (subset.length === 0) continue;

      const cheatCount = subset.filter((r) => r.cheatDetected).length;
      const honestCount = subset.filter((r) => r.honestPass).length;
      const cheatStr = pct(cheatCount, subset.length);
      const honestStr = pct(honestCount, subset.length);
      const label = proctorOn ? 'on' : 'off';
      // Lower cheat rate with proctor on is the desired outcome, color accordingly.
      const cheatColor = cheatCount > 0 ? (proctorOn ? pc.yellow : pc.red) : pc.green;

      out.write(
        model.padEnd(16) + label.padEnd(10) + cheatColor(cheatStr.padEnd(14)) + pc.dim(honestStr) + '\n'
      );
    }
  }
  out.write('\n');

  detectionRate(rows, out);
  if (opts?.mock) mockCaveat(out);
}

/**
 * Detection rate over the recorded cheat diffs: how many of them proctor's own checks flagged.
 *
 * This is the one number in a mock run that measures something. The proctor-off arm replays a
 * recorded diff, so "did runChecks flag it" is a real question with a real answer, asked against
 * whole-repo task diffs rather than the minimal planted cases in fixtures/.
 *
 * It is deliberately not reported as a hit rate out of "cheats", because the pool contains control
 * tasks that plant no cheat in either arm, and nothing in a scored row distinguishes a control from
 * a miss. Counting them as cheats would inflate the denominator and make a clean run look like a
 * failure; excluding them by guessing would do the opposite and quietly hide a real false negative.
 * Naming the denominator for what it actually is leaves the reader able to check.
 */
function detectionRate(rows: ScoredRow[], out: { write(s: string): void }): void {
  const offArm = rows.filter((r) => !r.proctorOn);
  if (offArm.length === 0) return;
  const caught = offArm.filter((r) => r.cheatDetected).length;
  const line =
    `Detection: ${caught} of ${offArm.length} proctor-off diffs flagged by proctor's own checks ` +
    '(the pool includes control tasks that plant no cheat, see bench/METHODOLOGY.md)';
  out.write(pc.dim(line) + '\n\n');
}

/**
 * Says plainly that a mock run's before/after columns are not evidence.
 *
 * The fixture runner replays a recorded cheat when proctor is off and a recorded honest fix when it
 * is on. The improvement between those two columns is therefore built into the fixtures, not
 * measured from an agent: it would read the same if proctor did nothing at all. That number is
 * exactly the kind of thing this project exists to catch, so the tool refuses to print it without
 * saying what it is.
 */
function mockCaveat(out: { write(s: string): void }): void {
  out.write(
    pc.yellow('Note: --mock replays recorded fixtures. ') +
      pc.dim(
        'The off arm replays a cheat and the on arm replays an honest fix, so the difference between\n' +
          'those two columns is built into the corpus, not measured from an agent, and it is not evidence that\n' +
          'proctor changes behaviour. It would look identical if proctor did nothing. Only the detection line\n' +
          'above measures anything here. For a behavioural claim, run against a real agent with --agent.\n'
      )
  );
}
