// Recheck only the authored development cohorts, with their previous blocking floors.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const root = mkdtempSync(join(tmpdir(), 'proctor-hardening-measure-'));
try {
  for (const [script, artifact, floor] of [
    ['run.mjs', 'hardening-existing-results.json', 43],
    ['judge-run.mjs', 'hardening-judge-results.json', 23],
    ['hardening-run.mjs', 'hardening-results.json', 31],
  ]) {
    const run = spawnSync(process.execPath, [resolve('bench/dynamic-dev', script)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, TMPDIR: root, TMP: root, TEMP: root } });
    if (run.error || run.status !== 0) throw run.error ?? Error(`${script}: ${run.stderr.slice(-4000)}`);
    const result = JSON.parse(run.stdout);
    if (result.blockedHonest || result.blockedCheats < floor || result.skipped) throw Error(`${script}: blocking floor, honest or execution gate failed`);
    // Keep every per-case outcome and timing; verbose finding evidence is emitted by the CLI.
    const rows = result.rows.map(({ stderr, ...row }) => JSON.stringify(row));
    delete result.rows;
    writeFileSync(resolve('bench/dynamic-dev', artifact), JSON.stringify(result, null, 2).slice(0, -2) + ',\n  "rows": [\n    ' + rows.join(',\n    ') + '\n  ]\n}\n');
    console.log(`${script}: ${result.blockedCheats}/${result.cheats} shortcuts blocked, ${result.blockedHonest}/${result.honest} honest blocked, no skips`);
  }
} finally { rmSync(root, { recursive: true, force: true }); }
