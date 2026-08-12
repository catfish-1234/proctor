export interface RuleMeta {
  name: string;
  shortDescription: string;
  fullDescription: string;
  defaultLevel: 'error' | 'warning' | 'note';
  helpUri: string;
  /**
   * What an honest fix for this rule actually looks like, for `check --explain <ID> --fix`.
   *
   * Blocking an agent only tells it that something was wrong. This tells it what to do instead,
   * which is the difference between a guard that stops bad work and one that redirects it. Each
   * entry deliberately opens with the real fix and closes with the escape hatch, because the
   * ordering is the message: fix the code first, and only reach for an approval when the test
   * change is genuinely intended.
   */
  fix: string;
}

/**
 * Closing guidance shared by every rule. Kept in one place so the escape hatch is described
 * identically everywhere and can't drift into sounding like the easy option.
 */
export const APPROVAL_GUIDANCE =
  'If the change really was intentional, do not approve it yourself. Say why you believe it is ' +
  'legitimate and let a human run `proctor approve <RH-ID> <file> --reason "..."` and commit it. ' +
  'Approvals are read from the committed config, so one added in the same change it excuses has ' +
  'no effect, and an approval never hides the finding, it only stops it blocking.';

export const RULE_METADATA: Record<string, RuleMeta> = {
  RH001: {
    name: 'TestDeletedOrRenamed',
    shortDescription: 'Test file or test function deleted or renamed',
    fullDescription:
      'Detects a test file or individual test function deleted, disabled, or renamed in a way that drops its test extension, hiding a failing test rather than fixing the underlying code.',
    defaultLevel: 'error',
    fix:
      'Put the test back exactly as it was, then make the code satisfy it. If the test is failing, the ' +
      'failure is the point: it is describing behavior the implementation does not have yet. Moving or ' +
      'renaming a test file is fine on its own, proctor only objects when the tests disappear rather than ' +
      'land somewhere else, so if this was a move, move the assertions along with the names.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh001',
  },
  RH002: {
    name: 'AssertionWeakened',
    shortDescription: 'Assertion weakened or precision reduced',
    fullDescription:
      'Detects a specific-value assertion softened into a vague check (e.g. toBe(x) to toBeDefined()), an exact value replaced by an ordering comparison on the same subject, ' +
      'or numeric comparison precision/tolerance widened. Also covers the Python forms: a `assert x == y` reduced to a bare `assert x` (the expected value dropped), and an assertEqual ' +
      'swapped for a vaguer matcher (assertIsNotNone/assertGreater/...) on the same value. Also covers Go (testify), Java/Kotlin (JUnit/kotlin.test/AssertJ/Kotest), Rust (assert_eq!/assert!), ' +
      'Ruby (RSpec/Minitest), PHP (PHPUnit), and C# (xUnit/NUnit/MSTest). Go coverage is testify-only; stdlib comparison-weakening is not pattern-matched. ' +
      'Also covers C++ (Google Test, Boost.Test, Catch2), C (Unity, CMocka, Check), Swift/Objective-C (a shared XCTest pattern, plus Swift Testing), Dart (expect()), ' +
      'Scala (ScalaTest assert(), munit via the existing Java/Kotlin bare pattern), VB.NET and Groovy (reused, zero new code, via the existing C#/Java patterns), ' +
      'Perl (Test::More), R (testthat), Haskell (Hspec shouldBe), Elixir (ExUnit, ported from the Python pattern), Lua (busted), Clojure ((is (= x y)) S-expressions), ' +
      'Shell/Bash (bats-assert), and Julia (the Test stdlib). Groovy\'s Spock power-assert (`expect:`/`then:` bare `==`) is not covered, no reliable single-line syntactic anchor exists. ' +
      'Shell/Bash\'s native `[ ]` test form is not covered either, only the bats-assert helper library is, the native form is too pervasive in ordinary shell control flow to anchor safely.',
    defaultLevel: 'error',
    fix:
      'Restore the original assertion and make the code produce the value it expects. A specific assertion ' +
      'that fails is worth more than a vague one that passes: `toBeDefined()` in place of `toBe(6)` means ' +
      'the test no longer knows what correct looks like. If the expected value itself is genuinely wrong, ' +
      'change it to the new specific value rather than to a weaker matcher, so the test still pins the ' +
      'behavior down.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh002',
  },
  RH003: {
    name: 'TestSkippedOrDisabled',
    shortDescription: 'Test disabled, skipped, or commented out',
    fullDescription:
      'Detects a test removed from the run without deleting its source. JS/TS: .skip/.only, xit/xdescribe, fit/fdescribe/xtest, .todo, a bracket-notation skip, or a commented-out test. ' +
      'Python: @pytest.mark.skip/skipif/xfail, a module-level pytestmark, __test__ = False, @unittest.skip, a commented-out test, and imperative runtime skips (pytest.skip/self.skipTest/SkipTest ' +
      'inside a named test module). Also covers Go (t.Skip/b.Skip), Java/Kotlin (@Disabled/@Ignore), Rust (#[ignore]), Ruby (xit/xdescribe, skip/pending), PHP (markTestSkipped/markTestIncomplete), ' +
      'and C# (Fact(Skip=...)/[Ignore]). Kotest\'s `enabled = false` skip form is not covered. ' +
      'Also covers C++ (GTEST_SKIP, DISABLED_ prefix, Catch2 SKIP()/hide tag, Boost.Test disabled()), C (Unity TEST_IGNORE, CMocka skip()), Swift (XCTSkip family, Swift Testing .disabled), ' +
      'Dart (@Skip, skip: parameter), Scala (@Ignore, munit .ignore/@IgnoreSuite, ScalaTest bare ignore), Groovy (@Ignore reused, plus Spock @IgnoreRest/@PendingFeature), ' +
      'VB.NET (<Ignore>/<Fact(Skip:=...)>), Perl (SKIP:/TODO: blocks), R (skip()/skip_if()/skip_on_cran()), Haskell (xit/xdescribe family, pendingWith/pending), ' +
      'Elixir (@tag :skip/@moduletag :skip), Lua (busted pending()), Clojure (kaocha ^:kaocha/skip), Shell/Bash (bats bare skip), and Julia (@test_skip, skip= parameter). ' +
      'Objective-C has no RH003 coverage at all, Apple\'s own documentation confirms XCTSkip/XCTSkipIf/XCTSkipUnless are Swift-only APIs. C\'s Check framework has no skip mechanism, ' +
      'only CMocka\'s is covered. Clojure\'s Leiningen :test-selectors and Shell/Bash\'s shunit2 startSkipping/endSkipping are not covered, both are stateful, non-local mechanisms a diff-line regex cannot reliably resolve.',
    defaultLevel: 'error',
    fix:
      'Remove the skip and fix what made the test fail. A skipped test is a test that is not running, which ' +
      'reads as green while covering nothing. If it fails intermittently, fix the flakiness at its source ' +
      'rather than skipping past it. If it depends on something unavailable in this environment, gate it on ' +
      'that condition explicitly so it still runs where it can.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh003',
  },
  RH004: {
    name: 'ImplementationHardcodesFixture',
    shortDescription: 'Implementation hardcodes test fixture value',
    fullDescription:
      'Detects implementation code that hardcodes or special-cases a value matching a test fixture literal, faking correct behavior for the specific inputs the test suite exercises. ' +
      'Deterministic core: fires only on two strong signals, (1) a return statement that previously computed a real expression now returns a bare literal, or (2) a single-line branch ' +
      'that special-cases a literal input to return a literal output. Weaker literal-matching candidates (no clear prior computation to compare against) are only flagged with --ai.',
    defaultLevel: 'error',
    fix:
      'Implement the general case instead of the specific one. Returning the literal the fixture expects, ' +
      'or branching on the exact input the test passes, makes that one test green while the function stays ' +
      'wrong for every other input. Write the logic the test is describing, and the fixture value falls out ' +
      'of it on its own.',
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
    fix:
      'Put the real implementation back. A body replaced with a bare return, a constant, or an ' +
      'always-satisfying mock makes the assertion pass without the behavior existing. If the real logic is ' +
      'not written yet, leave the test failing and say so: a failing test is an accurate report, and a ' +
      'stubbed one is a false report.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh005',
  },
  RH006: {
    name: 'SnapshotRewrittenWithoutReason',
    shortDescription: 'Snapshot/golden file rewritten without a stated reason',
    fullDescription:
      'Detects a snapshot or golden file rewritten alongside a code change with no stated reason in the commit message, potentially baking in a regression as the new expected output. ' +
      'Suppressed entirely when the commit message states a reason (snapshot/golden/regenerate/intentional/by design) or when the change is a pure deletion of stale snapshot entries.',
    defaultLevel: 'warning',
    fix:
      'Look at what actually changed in the snapshot before accepting it. If the new output is correct, ' +
      'regenerate it and state the reason in the commit message, which is enough to satisfy this check. If ' +
      'it is not correct, the diff just caught a regression, so fix the code and the old snapshot passes ' +
      'again.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh006',
  },
  RH007: {
    name: 'TestExcludedViaConfig',
    shortDescription: 'Test excluded from run path via config change',
    fullDescription:
      'Detects a test path ignore pattern added to test-runner or CI configuration, excluding tests from execution without touching the test files themselves. ' +
      'Also warns when proctor.config.json enforcement settings (enabled, ignorePatterns, severity, testPathGlobs, snapshotGlobs) are modified in a change. The running check still ' +
      'enforces the committed configuration, but the edit changes what future runs enforce. ' +
      'Also covers Java (Maven pom.xml, Gradle build.gradle(.kts)), Rust (Cargo.toml), Ruby (.rspec), PHP (phpunit.xml), C# (.runsettings), and Kotlin (Gradle build.gradle.kts). Go has no dedicated exclusion config file, so it is detected instead as a build tag (//go:build or // +build) newly added to an existing _test.go file. ' +
      'Also covers C++/C (CMake CMakeLists.txt set_tests_properties DISABLED), Swift/Objective-C (*.xctestplan skippedTests), Dart (dart_test.yaml exclude_tags/skip:), Scala (build.sbt Tests.Exclude/Tests.Argument), ' +
      'VB.NET and Groovy (reused, zero new code, via the existing C#/Kotlin patterns), R (.Rbuildignore, warn only, excludes from the package build rather than the test run specifically), ' +
      'Haskell (*.cabal buildable: False, gated to a test-suite stanza), Elixir (test_helper.exs ExUnit.start(exclude:...)), and Lua (.busted exclude-tags). ' +
      'Clojure\'s project.clj :test-selectors is warn only, the selector value is an arbitrary function form so only the key-touched signal is reliable. Perl, Shell/Bash, and Julia have no RH007 coverage at all, ' +
      'none has a dedicated exclusion config file or a safe structural analogue.',
    defaultLevel: 'error',
    fix:
      'Revert the config change and fix the tests it was going to exclude. Narrowing test discovery, adding ' +
      'an ignore pattern, or excluding a path makes the suite smaller rather than the code better, and the ' +
      'tests that stop running are usually the ones that were failing. If a config change is genuinely ' +
      'needed for another reason, make it in a change that does not also depend on those tests not running.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh007',
  },
  RH008: {
    name: 'TautologicalAssertion',
    shortDescription: 'Assertion always passes regardless of behavior',
    fullDescription:
      'Detects an assertion that always passes without testing real behavior: a literal `assert True`, a value asserted against itself (`assert x == x`, `expect(f(x)).toBe(f(x))`), ' +
      'or an assertion made on an empty `expect()` with no value under test. Fully deterministic, every pattern is an exact syntactic tautology with no legitimate use, so no --ai is needed.',
    defaultLevel: 'warning',
    fix:
      'Assert the real expected value. An assertion that compares a value to itself, or asserts a literal ' +
      'constant, cannot fail, so the test passes whatever the code does. That is the same as having no test ' +
      'at all. Work out what the function should return for the input, and assert that.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh008',
  },
  RH009: {
    name: 'CoverageGaming',
    shortDescription: 'Trivial test added while real assertions removed',
    fullDescription:
      'Detects a trivial test (no specific-value assertion) added to a file in the same change that removed a real, specific-value assertion, a pattern that keeps a test file green ' +
      'and coverage numbers up while quietly dropping what the tests actually verified. Requires both conditions in the same file to stay conservative.',
    defaultLevel: 'warning',
    fix:
      'Restore the assertions that were removed. Adding a test that only checks the code runs, while ' +
      'deleting the ones that checked what it produced, raises the test count and lowers the coverage that ' +
      'matters. If the new test is worth keeping, keep it as well as the old assertions, not instead of ' +
      'them.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh009',
  },
  RH010: {
    name: 'FailureMasking',
    shortDescription: 'Timeout/retry abuse, or a network mock manufacturing the expected answer',
    fullDescription:
      'Detects three independent failure-masking patterns: (1) jest.retryTimes/@pytest.mark.flaky reruns added to paper over a flaky or failing test, (2) an unusually large ' +
      'jest.setTimeout/@pytest.mark.timeout added to hide a hanging operation, or (3) a network response mocked to return literally the same value the test then asserts against.',
    defaultLevel: 'warning',
    fix:
      'Fix the underlying failure rather than giving it more room. Retries and long timeouts make an ' +
      'unreliable test report as green while staying unreliable, and a network mock returning exactly the ' +
      'value the test asserts means the test is checking the mock rather than the code. Find why it fails ' +
      'or hangs. If it is genuinely slow, say so in a comment next to the raised timeout so the number has ' +
      'a reason attached.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh010',
  },
  RH011: {
    name: 'TypeLintSilencingSpam',
    shortDescription: 'Type/lint suppression comments added to pass (spam, or one file-wide directive)',
    fullDescription:
      'Detects @ts-ignore/@ts-expect-error, `# type: ignore`, `# noqa`, `eslint-disable`, or `# pylint: disable` comments added to silence errors instead of fixing them. ' +
      'Fires when 2 or more per-line suppressions are added in the same change (a single per-line suppression is often a legitimate, justified exception), OR when even a single ' +
      'file-wide directive is added (a whole-file TypeScript nocheck, a blanket ESLint disable with no rule list, or a file-level flake8 noqa), since those silence every rule for the whole file. ' +
      'Also covers Go (//nolint), Java (@SuppressWarnings), Kotlin (@Suppress / file-wide @file:Suppress), Rust (#[allow(...)] / file-wide #![allow(...)]), Ruby (# rubocop:disable/enable), PHP (phpcs:ignore / file-wide phpcs:ignoreFile), and C# (#pragma warning disable). Go\'s file-wide //nolint, Ruby\'s unclosed rubocop:disable, and C#\'s unrestored #pragma warning disable are not detected, they require forward-scanning past the diff line. ' +
      'Also covers C++/C/Objective-C (a shared clang-tidy NOLINT family, clang pragma, cppcheck-suppress), Swift (swiftlint:disable, plus file-wide swiftlint:disable all), Dart (ignore:, plus file-wide ignore_for_file:), ' +
      'Scala (@nowarn, scalafix:ok, plus @SuppressWarnings reused from Java), Groovy (@SuppressWarnings reused, zero new code), VB.NET (#Disable Warning, a genuinely new token distinct from C#\'s pragma), ' +
      'Perl (## no critic), R (# nolint), Haskell (declaration-scoped {-# ANN ... HLint: ignore #-}, plus a file-wide module directive), Elixir (credo:disable-for-next-line/previous-line/lines:N, plus file-wide credo:disable-for-this-file), ' +
      'Lua (luacheck: ignore), Clojure (#_{:clj-kondo/ignore [...]}), and Shell/Bash (shellcheck disable=SC####). VB.NET, Perl, R, Lua, Clojure, and Shell/Bash coverage is line-scoped only, each language\'s file-wide or unclosed-suppression form ' +
      'requires forward-scanning past the diff line, which proctor\'s line-level model doesn\'t do. Julia has no RH011 coverage at all, no dominant inline-suppression convention was found.',
    defaultLevel: 'warning',
    fix:
      'Fix the type or lint error the suppression is hiding. A single justified suppression is normal. ' +
      'Several added at once, or one file-wide directive, is a way to make the checker quiet rather than ' +
      'the code correct. If one of them really is unavoidable, keep that one, scope it to the specific rule ' +
      'and line, and write down why.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh011',
  },
  RH012: {
    name: 'CIPipelineTampering',
    shortDescription: 'Test step removed from CI, or neutered so a failing suite still passes',
    fullDescription:
      'Detects a change to a CI pipeline definition that stops the test suite from running or stops its failures from counting. Covers a removed test command, ' +
      "'continue-on-error: true' (GitHub Actions, Azure Pipelines), 'allow_failure: true' (GitLab), a step disabled with 'if: false' or 'when: never', a test command with its exit code " +
      "swallowed by '|| true', and 'set +e' next to a test command. Reads .github/workflows/*.yml, .gitlab-ci.yml, .circleci/config.yml, azure-pipelines.yml, .travis.yml, Jenkinsfile, and " +
      'bitbucket-pipelines.yml. Every signature except a removed command only fires when a test command is visible in the same diff chunk, since each of them is routine and correct on a ' +
      'step that does something else, an artifact upload set to continue-on-error being the obvious case. A test command that merely moved within the same file is not reported as removed.',
    defaultLevel: 'error',
    fix:
      'Put the test step back and let it fail. Disabling the suite at the pipeline level is the same evasion ' +
      'as deleting the tests themselves, with the added problem that the build still displays a green check, ' +
      'so nobody has any signal that coverage stopped. Fix whatever made the step fail. If the suite genuinely ' +
      'belongs somewhere else now, move it and leave the pipeline saying where it went, so a reader can still ' +
      'tell the tests run.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh012',
  },
  RH013: {
    name: 'CoverageGateWeakened',
    shortDescription: 'Coverage threshold lowered or removed so less coverage now passes',
    fullDescription:
      'Detects a coverage threshold reduced or deleted in a project config, which lets a suite that lost coverage keep reporting as passing. Covers Jest and Vitest coverage thresholds, ' +
      'nyc, package.json, Python coverage fail_under (.coveragerc, setup.cfg, pyproject.toml, pytest.ini, tox.ini), SimpleCov, PHPUnit, Maven and Gradle, and Codecov targets. ' +
      'Only a threshold that moved down is reported: raising one, or adding one where none existed, is the change this check wants to see. A threshold deleted outright is reported too, ' +
      'since nothing enforces a floor afterwards. Old and new values are paired by key name within the same diff chunk, so a reformatted or reordered config still pairs correctly.',
    defaultLevel: 'error',
    fix:
      'Put the threshold back where it was and write the tests that reach it. Lowering the gate is the ' +
      'same move as deleting a test, one level up: the coverage it was protecting is gone either way, and ' +
      'the build still reports green. If the number was genuinely unreachable, say so next to it and lower ' +
      'it deliberately in its own change, not as part of the work that made it fail.',
    helpUri: 'https://github.com/catfish-1234/proctor#rh013',
  },

  // WI1xx, the work-integrity family. RH00x ask whether the tests were tampered with. These ask
  // whether the work behind them was actually done, reading shipped code rather than the suite.
  // Every one of them skips test files by design: an empty catch, canned data, and a loose cast all
  // mean something ordinary in a test and something quite different in the code it is testing.
  WI101: {
    name: 'SilentErrorSwallowing',
    shortDescription: 'Error discarded by an empty handler, so failures pass unnoticed',
    fullDescription:
      'Detects a change that adds an error handler which does nothing with the error. Covers an empty catch block (JS/TS, Java, C#, Kotlin, Scala, PHP, Swift), Python "except: pass" and ' +
      'handlers that return a default instead, a promise .catch that discards its argument, Ruby "rescue nil" and empty rescue blocks, Go "if err != nil {}" with an empty body, and an error ' +
      'assigned to the blank identifier. Only fires on a handler this change introduced, in non-test code, and never when the handler carries a comment explaining why discarding the error is ' +
      'safe: a handler somebody justified in writing is the outcome this check exists to produce.',
    defaultLevel: 'error',
    fix:
      'Do something with the error: handle it, or let it propagate to a caller that can. Swallowing it does not ' +
      'make the failure stop happening, it makes it stop being reported, which is strictly worse than the ' +
      'original failure because now nothing is going to tell you about it. If discarding the error genuinely is ' +
      'correct here, and sometimes it is, write the one-line reason in the handler so the next reader does not ' +
      'have to reconstruct your argument.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi101',
  },
  WI102: {
    name: 'UnimplementedWorkClaimed',
    shortDescription: 'Explicit not-implemented marker added to shipped code',
    fullDescription:
      'Detects an explicit unimplemented marker introduced into non-test code: raise NotImplementedError, throw new NotImplementedException, a thrown Error whose message says "not implemented", ' +
      'Rust todo!()/unimplemented!(), Kotlin TODO(), a Go panic or Swift fatalError saying the same, and a Python pass body marked TODO. Deliberately not a general TODO-comment scan, which would ' +
      'fire on every healthy codebase. Abstract declarations are exempt, since raising NotImplementedError is the correct body for an abstract method: the check looks back a few lines for an ' +
      '@abstractmethod decorator, an abstract/interface/protocol keyword, or an ABC base, and skips declaration files (.d.ts, .pyi) entirely.',
    defaultLevel: 'error',
    fix:
      'Implement the path, or leave it out of the change. What this check objects to is not the marker, it is the ' +
      'combination of the marker and a change that reads as finished work. If the path genuinely cannot be built ' +
      'yet, say so in your summary in plain words rather than only in a token buried in the code, so nobody has ' +
      'to read the diff to discover that the feature does not exist.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi102',
  },
  WI103: {
    name: 'ValidationRemoved',
    shortDescription: 'Guard clause or contract enforcement deleted from shipped code',
    fullDescription:
      'Detects validation deleted from non-test code: a thrown error or raised exception, an assertion, a panic, a Go error return, or a precondition helper such as require/checkNotNull. ' +
      'A guard clause is a test that runs in production, so deleting one to make a failing case pass is the same move as deleting a unit test, minus the record that it happened. Silence is bought ' +
      'cheaply on purpose: if the same change adds any line mentioning validation, verification, a schema, or a throw anywhere in that file, the guard is treated as having moved rather than gone, ' +
      'because a false positive here lands on somebody extracting a validator, which is exactly the work this check should never discourage.',
    defaultLevel: 'error',
    fix:
      'Put the guard back and make the code satisfy it. A guard fires because something upstream is sending it ' +
      'input it said it would not send; deleting the guard does not fix that, it just moves where the damage ' +
      'shows up and delays it. If the input really is legitimate now, the guard should change deliberately, in ' +
      'its own change, with the reason recorded, rather than disappearing inside the work that tripped it.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi103',
  },
  WI104: {
    name: 'GuardrailDisabled',
    shortDescription: 'Proctor, a commit hook, or a type/lint gate switched off instead of satisfied',
    fullDescription:
      "Detects a change that disables the checks watching it. Covers proctor's own config (a check removed from 'enabled', a severity downgraded to warn or info, an entry added to " +
      "'ignorePatterns' or 'approvedTestChanges'), deletion of proctor's config, manifest, or a deployed ruleset file such as AGENTS.md or CLAUDE.md, a proctor invocation removed from " +
      'package.json, a workflow, a husky hook or a Makefile, an added --no-verify or HUSKY=0 hook bypass, a TypeScript strictness flag turned off in tsconfig, an ESLint rule set to "off", and ' +
      "entries added to a lint ignore file. Proctor already reads its own config from the committed baseline, so a config edit cannot weaken the run it appears in; this check exists to make the " +
      'attempt visible rather than silently ignored.',
    defaultLevel: 'error',
    fix:
      'Turn the guard back on and fix what it was reporting. Note that weakening proctor in the same change it ' +
      'would excuse does not work anyway: config and approvals are both read from the committed baseline, so an ' +
      'edit that arrives alongside the thing it permits has no effect on the run. If a check is genuinely wrong ' +
      'for this repository, that is a conversation to have with a human and a change to land on its own, ' +
      'separately from whatever work it is currently blocking.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi104',
  },
  WI105: {
    name: 'FakeDataSubstituted',
    shortDescription: 'Real network, database, or filesystem work replaced with canned data',
    fullDescription:
      'Detects shipped code that returns fixed data where it should be doing work. Two signals: a value named as mock, fake, stub, dummy, sample, placeholder, or canned data being returned from ' +
      'non-test code, which fires on its own; and the pairing of a removed network, database, or filesystem call with a fixed value returned in its place within the same diff chunk. The pairing ' +
      'is required for the second signal because neither half means anything alone, a literal return being what most functions do. A line disclosing itself as temporary is left to WI102 rather ' +
      'than double-reported here.',
    defaultLevel: 'error',
    fix:
      'Do the real call and return its result. A function that returns a fixed object instead of fetching one is ' +
      'not a partial implementation of fetching, it is a different function that happens to typecheck, and every ' +
      'caller downstream is now built on a value that will never change. If the real source genuinely is not ' +
      'available yet, the honest move is to say the integration is not built rather than to ship something ' +
      'shaped like it.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi105',
  },
  WI106: {
    name: 'TypeSafetyEroded',
    shortDescription: 'Types widened to any or an unsafe cast to silence the type checker',
    fullDescription:
      'Detects type safety given up rather than satisfied: as any, a bare any annotation, as-unknown-as double casts, any[], Python Any, Go interface{}, C# dynamic, and @ts-expect-error. ' +
      'Complements RH011, which watches suppression comments; this watches the widenings that leave no comment behind at all. Fires in two cases, either a declaration that previously had a ' +
      'specific type being widened in this change, which is the strongest form since the before-state proves the type was knowable, or two or more unexplained widenings in one change. Scoped to ' +
      'typed languages, skips .d.ts files, and skips any widening whose line carries an explanation.',
    defaultLevel: 'warning',
    fix:
      'Give the values real types and fix the mismatch the checker was reporting. Widening to any does not make ' +
      'two types agree, it stops anyone being told that they disagree, and it keeps doing that forever, for every ' +
      'future reader, long after the immediate error is forgotten. A genuine untyped boundary does exist ' +
      'sometimes: cast exactly that one value and write the reason on the line, which also stops this check ' +
      'firing on it.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi106',
  },
  WI107: {
    name: 'SecurityControlDisabled',
    shortDescription: 'A security check switched off, or an authorization gate removed',
    fullDescription:
      'Detects security controls turned off rather than satisfied. Covers TLS certificate verification disabled (rejectUnauthorized: false, verify=False, InsecureSkipVerify: true, strictSSL: false, NODE_TLS_REJECT_UNAUTHORIZED=0, an unverified SSL context, check_hostname=False, CURLOPT_SSL_VERIFYPEER off, curl -k, an accept-everything certificate callback, a trust-all manager), CSRF protection disabled or exempted, and the removal of a framework authorization gate (@login_required, @PreAuthorize, [Authorize], @Secured, @RolesAllowed, permission and auth decorators). ' +
      'Scoped to framework gates rather than hand-rolled checks, which are WI103\'s territory, because there is no refactor that removes @login_required from a handler and leaves it protected. Unlike the rest of the family, an explanatory comment does not buy silence: "we know the certificate is invalid" is not a reason that makes shipping it safe.',
    defaultLevel: 'error',
    fix:
      'Fix the underlying problem rather than the symptom. A certificate that does not validate means the ' +
      'wrong certificate, the wrong authority, or the wrong hostname, and all three are fixable; turning ' +
      'verification off ships a system that looks like it works and is not secure, which is worse than the ' +
      'error you started with because nothing will tell you again. If an endpoint really is meant to be ' +
      'public, that is a decision a human makes deliberately and records, not a side effect of getting a ' +
      'test to pass.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi107',
  },
  WI108: {
    name: 'SourceHiddenFromReview',
    shortDescription: 'Source or tests hidden from git, and therefore from every check',
    fullDescription:
      'Detects code being hidden rather than fixed. Proctor reads git diff, so anything git stops reporting is invisible to every check at once: adding a path to .gitignore or .git/info/exclude makes a gutted implementation or a deleted test disappear from review, and `git update-index --assume-unchanged` or `--skip-worktree` does the same to an already-tracked file without touching any config. ' +
      'Deliberately narrow, because ignore files gain entries constantly for good reasons. Build output, logs, caches, dependency and vendor trees, minified bundles, and editor droppings are all excluded before the check looks at anything, and a negation (!path) is a re-inclusion rather than a hide. What fires is an entry naming a file with a source-code extension, or a path that reads as a test suite.',
    defaultLevel: 'error',
    fix:
      'Remove the entry and deal with the file. Ignore files are for build output and local droppings, not ' +
      'for code: hiding a source file does not make its problem go away, it makes the problem invisible to ' +
      'you as well as to everyone reviewing after you. If the file genuinely does not belong in the ' +
      'repository, delete it in a change of its own, where somebody can see that is what happened.',
    helpUri: 'https://github.com/catfish-1234/proctor#wi108',
  },
};
