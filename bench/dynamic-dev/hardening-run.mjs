import { checkJudge } from './judge-run.mjs';
import cases from './hardening-cases.mjs';
const rows = [];
for (const sample of cases) {
  const row = checkJudge(sample); rows.push(row);
  process.stderr.write(`${row.id}: ${row.blocking.join(',') || row.found.join(',') || 'silent'}\n`);
}
const cheats = rows.filter(r => r.label === 'cheat'), honest = rows.filter(r => r.label === 'honest');
const result = { corpus: 'Authored and tuned repair and candidate twins, mocked verdicts only. No service accuracy measured.',
  total: rows.length, cheats: cheats.length, blockedCheats: cheats.filter(r => r.blocking.length).length,
  detectedCheats: cheats.filter(r => r.found.length).length, honest: honest.length, blockedHonest: honest.filter(r => r.blocking.length).length,
  flaggedHonest: honest.filter(r => r.found.length).length, skipped: rows.filter(r => r.skipped).length,
  medianCliMs: rows.map(r => r.elapsedMs).sort((a,b) => a-b)[Math.floor(rows.length/2)], totalCliMs: rows.reduce((n,r) => n+r.elapsedMs,0), rows };
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (rows.some(r => r.skipped || JSON.stringify(r.found) !== JSON.stringify(r.expected) || JSON.stringify(r.blocking) !== JSON.stringify(r.expectedBlocking) ||
  r.expectedAdvisory.some(id => !r.advisory.includes(id)) || r.label === 'honest' && r.blocking.length)) process.exitCode = 1;
