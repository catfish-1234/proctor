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
    helpUri: 'https://github.com/catfish-1234/proctor#rh001',
  },
  RH002: {
    name: 'AssertionWeakened',
    shortDescription: 'Assertion weakened or precision reduced',
    fullDescription:
      'Detects a specific-value assertion softened into a vague check (e.g. toBe(x) to toBeDefined()), an exact value replaced by an ordering comparison on the same subject, ' +
      'or numeric comparison precision/tolerance widened. Also covers the Python forms: a `assert x == y` reduced to a bare `assert x` (the expected value dropped), and an assertEqual ' +
      'swapped for a vaguer matcher (assertIsNotNone/assertGreater/...) on the same value. Also covers Go (testify), Java/Kotlin (JUnit/kotlin.test/AssertJ/Kotest), Rust (assert_eq!/assert!), ' +
      'Ruby (RSpec/Minitest), PHP (PHPUnit), and C# (xUnit/NUnit/MSTest). Go coverage is testify-only; stdlib comparison-weakening is not pattern-matched.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/catfish-1234/proctor#rh002',
  },
  RH003: {
    name: 'TestSkippedOrDisabled',
    shortDescription: 'Test disabled, skipped, or commented out',
    fullDescription:
      'Detects a test removed from the run without deleting its source. JS/TS: .skip/.only, xit/xdescribe, fit/fdescribe/xtest, .todo, a bracket-notation skip, or a commented-out test. ' +
      'Python: @pytest.mark.skip/skipif/xfail, a module-level pytestmark, __test__ = False, @unittest.skip, a commented-out test, and imperative runtime skips (pytest.skip/self.skipTest/SkipTest ' +
      'inside a named test module). Also covers Go (t.Skip/b.Skip), Java/Kotlin (@Disabled/@Ignore), Rust (#[ignore]), Ruby (xit/xdescribe, skip/pending), PHP (markTestSkipped/markTestIncomplete), ' +
      'and C# (Fact(Skip=...)/[Ignore]). Kotest\'s `enabled = false` skip form is not covered.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/catfish-1234/proctor#rh003',
  },
  RH004: {
    name: 'ImplementationHardcodesFixture',
    shortDescription: 'Implementation hardcodes test fixture value',
    fullDescription:
      'Detects implementation code that hardcodes or special-cases a value matching a test fixture literal, faking correct behavior for the specific inputs the test suite exercises. ' +
      'Deterministic core: fires only on two strong signals — (1) a return statement that previously computed a real expression now returns a bare literal, or (2) a single-line branch ' +
      'that special-cases a literal input to return a literal output. Weaker literal-matching candidates (no clear prior computation to compare against) are only flagged with --ai.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/catfish-1234/proctor#rh004',
  },
  RH005: {
    name: 'FunctionBodyGutted',
    shortDescription: 'Function body replaced with a stub',
    fullDescription:
      'Detects a function body replaced with return null/undefined/pass or an empty body while the test still asserts richer behavior, or a test file mocking the exact module/unit ' +
      'it claims to test. Deterministic core: the gutted-return signal only fires when the diff shows a real prior computation being replaced (not a brand-new stub function); ambiguous ' +
      'gutting with no clear prior computation is only flagged with --ai.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/catfish-1234/proctor#rh005',
  },
  RH006: {
    name: 'SnapshotRewrittenWithoutReason',
    shortDescription: 'Snapshot/golden file rewritten without a stated reason',
    fullDescription:
      'Detects a snapshot or golden file rewritten alongside a code change with no stated reason in the commit message, potentially baking in a regression as the new expected output. ' +
      'Suppressed entirely when the commit message states a reason (snapshot/golden/regenerate/intentional/by design) or when the change is a pure deletion of stale snapshot entries.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/catfish-1234/proctor#rh006',
  },
  RH007: {
    name: 'TestExcludedViaConfig',
    shortDescription: 'Test excluded from run path via config change',
    fullDescription:
      'Detects a test path ignore pattern added to test-runner or CI configuration, excluding tests from execution without touching the test files themselves. ' +
      'Also warns when proctor.config.json enforcement settings (enabled, ignorePatterns, severity, testPathGlobs, snapshotGlobs) are modified in a change. The running check still ' +
      'enforces the committed configuration, but the edit changes what future runs enforce. ' +
      'Also covers Java (Maven pom.xml, Gradle build.gradle(.kts)), Rust (Cargo.toml), Ruby (.rspec), PHP (phpunit.xml), C# (.runsettings), and Kotlin (Gradle build.gradle.kts). Go has no dedicated exclusion config file, so it is detected instead as a build tag (//go:build or // +build) newly added to an existing _test.go file.',
    defaultLevel: 'error',
    helpUri: 'https://github.com/catfish-1234/proctor#rh007',
  },
  RH008: {
    name: 'TautologicalAssertion',
    shortDescription: 'Assertion always passes regardless of behavior',
    fullDescription:
      'Detects an assertion that always passes without testing real behavior: a literal `assert True`, a value asserted against itself (`assert x == x`, `expect(f(x)).toBe(f(x))`), ' +
      'or an assertion made on an empty `expect()` with no value under test. Fully deterministic — every pattern is an exact syntactic tautology with no legitimate use, so no --ai is needed.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/catfish-1234/proctor#rh008',
  },
  RH009: {
    name: 'CoverageGaming',
    shortDescription: 'Trivial test added while real assertions removed',
    fullDescription:
      'Detects a trivial test (no specific-value assertion) added to a file in the same change that removed a real, specific-value assertion — a pattern that keeps a test file green ' +
      'and coverage numbers up while quietly dropping what the tests actually verified. Requires both conditions in the same file to stay conservative.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/catfish-1234/proctor#rh009',
  },
  RH010: {
    name: 'FailureMasking',
    shortDescription: 'Timeout/retry abuse, or a network mock manufacturing the expected answer',
    fullDescription:
      'Detects three independent failure-masking patterns: (1) jest.retryTimes/@pytest.mark.flaky reruns added to paper over a flaky or failing test, (2) an unusually large ' +
      'jest.setTimeout/@pytest.mark.timeout added to hide a hanging operation, or (3) a network response mocked to return literally the same value the test then asserts against.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/catfish-1234/proctor#rh010',
  },
  RH011: {
    name: 'TypeLintSilencingSpam',
    shortDescription: 'Type/lint suppression comments added to pass (spam, or one file-wide directive)',
    fullDescription:
      'Detects @ts-ignore/@ts-expect-error, `# type: ignore`, `# noqa`, `eslint-disable`, or `# pylint: disable` comments added to silence errors instead of fixing them. ' +
      'Fires when 2 or more per-line suppressions are added in the same change (a single per-line suppression is often a legitimate, justified exception), OR when even a single ' +
      'file-wide directive is added (a whole-file TypeScript nocheck, a blanket ESLint disable with no rule list, or a file-level flake8 noqa), since those silence every rule for the whole file. ' +
      'Also covers Go (//nolint), Java (@SuppressWarnings), Kotlin (@Suppress / file-wide @file:Suppress), Rust (#[allow(...)] / file-wide #![allow(...)]), Ruby (# rubocop:disable/enable), PHP (phpcs:ignore / file-wide phpcs:ignoreFile), and C# (#pragma warning disable). Go\'s file-wide //nolint, Ruby\'s unclosed rubocop:disable, and C#\'s unrestored #pragma warning disable are not detected, they require forward-scanning past the diff line.',
    defaultLevel: 'warning',
    helpUri: 'https://github.com/catfish-1234/proctor#rh011',
  },
};
