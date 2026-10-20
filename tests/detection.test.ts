import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import parseDiff from 'parse-diff';
import { buildContext, RH_CHECKS, WI_CHECKS } from '../src/context/index.js';
import { runChecks } from '../src/engine.js';
import { withCase } from '../scripts/detection-cases.mjs';

interface Sample { name: string; rule: string | null; before: Record<string,string|null>; after: Record<string,string|null> }
for (const split of ['design','validation']) {
  const fixture = join(process.cwd(),'bench','detection',`${split}.json`);
  const samples: Sample[] = JSON.parse(readFileSync(fixture,'utf8'));
  describe(`${split} structural detection`, () => {
    it('keeps the pre-change fixture bytes frozen', () => {
      const checksums = readFileSync(join(process.cwd(),'bench','detection','frozen.sha256'),'utf8');
      expect(checksums).toContain(createHash('sha256').update(readFileSync(fixture)).digest('hex') + `  ${split}.json`);
    });
    for (const sample of samples) it(sample.name, async () => {
      await withCase(sample, async (cwd: string, diff: string) => {
        const context = await buildContext(cwd,parseDiff(diff));
        const findings = await runChecks({...context,enabled:[...RH_CHECKS,...WI_CHECKS]});
        if (sample.rule) expect(findings.map(f=>f.verifierId)).toContain(sample.rule);
        else expect(findings).toEqual([]);
      });
    });
  });
}
