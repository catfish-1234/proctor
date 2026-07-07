export interface RuleMeta {
  name: string;
  shortDescription: string;
  fullDescription: string;
  defaultLevel: 'error' | 'warning' | 'note';
  helpUri: string;
}

export const RULE_METADATA: Record<string, RuleMeta> = {
  RH001: {
    name: 'TestDeletedOrRenamed',
    shortDescription: 'Test file or test function deleted or renamed',
    fullDescription:
      'Detects a test file or individual test function deleted, disabled, or renamed in a way that drops its test extension, hiding a failing test rather than fixing the underlying code.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/kavishdua/proctor#rh001',
  },
  RH002: {
    name: 'AssertionWeakened',
    shortDescription: 'Assertion weakened or precision reduced',
    fullDescription:
      'Detects a specific-value assertion softened into a vague check (e.g. toBe(x) to toBeDefined()), or numeric comparison precision/tolerance widened, reducing the test\'s ability to catch regressions.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/kavishdua/proctor#rh002',
  },
  RH003: {
    name: 'TestSkippedOrDisabled',
    shortDescription: 'Test disabled via skip/only decorator',
    fullDescription:
      'Detects a test disabled via .skip/.only, xit/xdescribe, or pytest/unittest skip decorators, removing it from the executed test suite without deleting the source.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/kavishdua/proctor#rh003',
  },
  RH004: {
    name: 'ImplementationHardcodesFixture',
    shortDescription: 'Implementation hardcodes test fixture value',
    fullDescription:
      'Detects implementation code that hardcodes or special-cases a value matching a test fixture literal, faking correct behavior for the specific inputs the test suite exercises.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/kavishdua/proctor#rh004',
  },
  RH005: {
    name: 'FunctionBodyGutted',
    shortDescription: 'Function body replaced with a stub',
    fullDescription:
      'Detects a function body replaced with return null/undefined/pass or an empty body while the test still asserts richer behavior, gutting the implementation under test.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/kavishdua/proctor#rh005',
  },
  RH006: {
    name: 'SnapshotRewrittenWithoutReason',
    shortDescription: 'Snapshot/golden file rewritten without a stated reason',
    fullDescription:
      'Detects a snapshot or golden file rewritten alongside a code change with no stated reason in the commit message, potentially baking in a regression as the new expected output.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/kavishdua/proctor#rh006',
  },
  RH007: {
    name: 'TestExcludedViaConfig',
    shortDescription: 'Test excluded from run path via config change',
    fullDescription:
      'Detects a test path ignore pattern added to test-runner or CI configuration, excluding tests from execution without touching the test files themselves.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/kavishdua/proctor#rh007',
  },
  RH008: {
    name: 'TautologicalAssertion',
    shortDescription: 'Assertion always passes regardless of behavior',
    fullDescription:
      'Detects an assertion that always passes without testing real behavior, such as asserting a value against itself or a value it was just derived from.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/kavishdua/proctor#rh008',
  },
};
