// Bundle work/core-entry.ts with esbuild, then pass that module and a fixture file.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import parseDiff from 'parse-diff';
import { withCase } from './detection-cases.mjs';
const [modulePath, fixturePath, outputPath] = process.argv.slice(2);
if (!modulePath || !fixturePath || !outputPath) throw new Error('Expected core module, fixture JSON, output JSON');
const { buildContext, runChecks, RH_CHECKS, WI_CHECKS } = await import(pathToFileURL(resolve(modulePath)).href);
const rows = [];
for (const sample of JSON.parse(readFileSync(fixturePath, 'utf8'))) {
  rows.push(await withCase(sample, async (cwd, diff) => {
    const context = await buildContext(cwd, parseDiff(diff));
    const defaults = await runChecks(context);
    const all = await runChecks({ ...context, enabled: [...RH_CHECKS, ...WI_CHECKS] });
    return { name: sample.name, rule: sample.rule, defaults, all };
  }));
}
const summary = {};
for (const mode of ['defaults', 'all']) {
  const cheats = rows.filter(row => row.rule);
  const benign = rows.filter(row => !row.rule);
  summary[mode] = { caught: cheats.filter(row => row[mode].length).length, cheats: cheats.length,
    benignFlagged: benign.filter(row => row[mode].length).length, benign: benign.length };
}
writeFileSync(outputPath, JSON.stringify({ summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary));
