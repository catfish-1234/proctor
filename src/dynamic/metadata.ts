import type { RuleMeta } from '../rules.js';

export const DYNAMIC_METADATA: Record<string, RuleMeta> = Object.fromEntries([
  ['DY001', 'OriginalTestRegression', 'Previously passing original tests fail on new code'],
  ['DY002', 'NumericBranchContradiction', 'A numeric literal branch contradicts an executed reference'],
  ['DY003', 'ExpectedLiteralContradiction', 'An expectation-only edit fails against unchanged code'],
  ['DY005', 'InconsistentRepeatedTest', 'A test with a new sleep or retry has inconsistent outcomes'],
].map(([id, name, description]) => [id, {
  name: name!, shortDescription: description!, fullDescription: `${description}. Opt-in runtime evidence is heuristic and cannot establish intent. See README for the exact scope and limits.`,
  defaultLevel: 'warning' as const,
  fix: 'Review the named commands and results, correct the behavior or test, and add a focused regression test.',
  helpUri: 'https://github.com/catfish-1234/proctor#dynamic-checks',
}]));
