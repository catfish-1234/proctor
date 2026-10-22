import type { RuleMeta } from '../rules.js';

export const DYNAMIC_METADATA: Record<string, RuleMeta> = Object.fromEntries([
  ['DY001', 'OriginalTestRegression', 'Previously passing original tests fail on new code'],
  ['DY002', 'NumericBranchContradiction', 'A literal branch contradicts an executed numeric, string or boolean reference'],
  ['DY003', 'ExpectedLiteralContradiction', 'An expectation-only edit changes a test outcome on unchanged code'],
  ['DY004', 'SurvivingSourceMutation', 'A changed statement in a called function can be mutated without a failing test'],
  ['DY005', 'InconsistentRepeatedTest', 'A test with a new sleep or retry has inconsistent outcomes'],
  ['DY006', 'GeneratedContractViolation', 'Generated inputs violate an unchanged explicitly declared test contract'],
  ['DY007', 'BehaviorSweepDivergence', 'Generated inputs expose broad behavior differences outside visible literals'],
  ['DY008', 'DocumentedContractViolation', 'Runtime behavior contradicts unchanged documentation'],
  ['DY009', 'JudgedDocumentationViolation', 'A quoted documentation claim is contradicted in stable fresh runtime runs'],
].map(([id, name, description]) => [id, {
  name: name!, shortDescription: description!, fullDescription: `${description}. ${id === 'DY003' ? 'An edited expectation already passing on old code is an error; an old pass made red remains a warning. ' : id === 'DY006' ? 'Requires an unchanged explicit test contract and stable assertion failures on generated inputs; unannotated differences cannot block. ' : id === 'DY008' ? 'Precise unchanged documentation can block stable violations backed by an old pass or an added passing test claim. Ambiguous documentation remains advisory. ' : id === 'DY009' ? 'Requires both --dynamic and --judge, an exact unchanged quote and stable runtime reproduction. Interpretation alone never blocks. ' : ''}Opt-in runtime evidence cannot establish intent. See README for the exact scope and limits.`,
  defaultLevel: ['DY003', 'DY006', 'DY008', 'DY009'].includes(id!) ? 'error' as const : 'warning' as const,
  fix: 'Review the named commands and results, correct the behavior or test, and add a focused regression test.',
  helpUri: 'https://github.com/catfish-1234/proctor#dynamic-checks',
}]));
