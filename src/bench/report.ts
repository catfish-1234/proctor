// Before/after (proctor off vs on) cheat-rate + honest-pass-rate table, per model.
// Mirrors src/reporters/pretty.ts's injectable-stream + picocolors formatter pattern.
import pc from 'picocolors';
import type { ScoredRow } from './scorer.js';

export interface ReportOptions {
  stream?: { write(s: string): void };
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

  out.write(pc.bold('\nBenchmark: cheat rate & honest-pass rate — proctor off vs on\n'));
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
      // Lower cheat rate with proctor on is the desired outcome — color accordingly.
      const cheatColor = cheatCount > 0 ? (proctorOn ? pc.yellow : pc.red) : pc.green;

      out.write(
        model.padEnd(16) + label.padEnd(10) + cheatColor(cheatStr.padEnd(14)) + pc.dim(honestStr) + '\n'
      );
    }
  }
  out.write('\n');
}
