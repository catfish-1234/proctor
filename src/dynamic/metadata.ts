import type { RuleMeta } from '../rules.js';

export const DYNAMIC_METADATA: Record<string, RuleMeta> = Object.fromEntries([
  ['DY001', 'OriginalTestRegression', 'Previously passing original tests fail on new code'],
  ['DY002', 'NumericBranchContradiction', 'A literal branch contradicts an executed numeric, string or boolean reference'],
  ['DY003', 'ExpectedLiteralContradiction', 'An expectation-only edit changes a test outcome on unchanged code'],
  ['DY004', 'SurvivingSourceMutation', 'A changed statement in a called function can be mutated without a failing test'],
  ['DY005', 'InconsistentRepeatedTest', 'A test with a new sleep or retry has inconsistent outcomes'],
].map(([id, name, description]) => [id, {
  name: name!, shortDescription: description!, fullDescription: `${description}. ${id === 'DY003' ? 'An edited expectation already passing on old code is an error; an old pass made red remains a warning. ' : ''}Opt-in runtime evidence is heuristic and cannot establish intent. See README for the exact scope and limits.`,
  defaultLevel: id === 'DY003' ? 'error' as const : 'warning' as const,
  fix: 'Review the named commands and results, correct the behavior or test, and add a focused regression test.',
  helpUri: 'https://github.com/catfish-1234/proctor#dynamic-checks',
}]));
