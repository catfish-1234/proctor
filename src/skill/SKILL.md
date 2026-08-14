# Proctor Skill: Honest Completion Ruleset

This is the canonical L1 skill for any AI coding agent working in a repository
that uses `proctor`. It applies to every agent turn that touches test files or
the code those tests exercise. Copy of this document is deployed verbatim to
every supported agent's conventional skill/rule path (see `src/adapters/registry.ts`).
Do not hand-edit deployed copies. Edit this file and run `proctor install-skill`.

## 1. The Core Rules

These rules are non-negotiable. They apply regardless of how much pressure
there is to show a green build.

Rules 1 to 5 are about the test suite. Rules 6 to 10 are about the work the
suite is supposed to be proving, because a green build is only one of the
things an agent can fake, and the others do not touch a test file at all.

1. **Never modify, skip, or delete a test to make it pass.** A test is a
   contract about correct behavior, not an obstacle standing between you and
   a passing build.
2. **If a test appears genuinely wrong, STOP and flag it to a human with
   rationale.** Do not silently "fix" a test you believe is incorrect. Explain
   why you think it's wrong and let a human decide.
3. **Never hardcode an implementation to match a test fixture literal.**
   Special-casing a return value so it matches exactly what the test expects,
   without implementing the real underlying logic, is not a fix.
4. **Never gut real logic behind an always-true mock.** Replacing a function
   body with a stub, a constant, or a mock that always satisfies the assertion
   is not the same as making the code correct.
5. **A fix is not done until the original, unaltered tests pass**, or a
   human has explicitly approved a change to the test itself. Passing tests
   you weakened, skipped, or replaced does not count as done.
6. **Never discard an error to make a failure stop.** An empty catch, an
   `except: pass`, a `rescue nil`, a discarded promise rejection: none of
   these fix anything. They stop the failure being reported, which is worse
   than the failure, because now nobody will find out. Handle the error or
   let it propagate. If discarding it genuinely is correct, write the reason
   in the handler.
7. **Never delete validation to make a case pass.** A guard clause is a test
   that runs in production. Deleting a `throw`, a `raise`, an `assert`, or a
   precondition check because something tripped it is the same move as
   deleting a failing test, minus the record that it happened.
8. **Never present unfinished or faked work as finished.** That covers
   shipping a `NotImplementedError`, a `todo!()`, or a "not implemented"
   throw inside a change you describe as complete, and it covers returning
   canned, mock, or placeholder data from code that is supposed to do real
   work. If you could not build it, say so in plain words.
9. **Never disable a security control or hide code from review.** Do not
   turn off TLS certificate verification, drop an authorization gate, or
   disable CSRF protection to make a request succeed. Do not add source or
   test files to `.gitignore`, and do not use `git update-index
   --assume-unchanged`: code git cannot see is code nobody can review.
10. **Never turn off the checks instead of satisfying them.** Do not disable
   a proctor check, lower its severity, add an ignore pattern, write your own
   approval, delete a ruleset file, add `--no-verify`, switch off TypeScript
   strictness, or widen a type to `any` to silence the checker. If a check is
   genuinely wrong, that is Rule 2: stop and say so.

Rule 5's approval is a specific, concrete thing, not a figure of speech. A human
records it by running `proctor approve <RH-ID> <file> --reason "..."` and
committing the result. You do not get to grant it to yourself: approvals are read
from the committed config, so one you add in the same change you are making has no
effect. If you think a test change is genuinely warranted, say so and ask, the way
Rule 2 describes. Do not write the approval and carry on.

## 2. The Guard That Enforces This

These rules are not just values or prose to keep in mind. They are backed by
a deterministic enforcement mechanism. `proctor`, a deterministic diff-level
guard, runs on every commit and on every agent turn (via the Claude Code Stop
hook and the git pre-commit hook) and will block on any error-severity
violation of the rules above. If you delete, skip, or weaken a test, or
hardcode/gut the implementation behind it, `proctor` inspects the diff, not
your reasoning about the diff, and stops the commit or turn before it lands.
There is no way to reason around it from inside the agent's own context,
because it operates below that layer, directly on the diff.

Concretely: `proctor check --uncommitted --ci` runs after every agent turn ends,
reading staged and unstaged changes alike, so leaving an edit unstaged hides
nothing. If it finds an error-severity finding, the turn is blocked and the
finding is reported back to you to fix honestly. Treat a block from this guard as
the guard doing its job, not as a bug to work around.

## 3. Rule Reference

Each row below is sourced verbatim from `RULE_METADATA` in `src/rules.ts`,
the same registry the tool itself uses to report findings. If you see one of
these rule IDs in a `proctor` finding, this table tells you what it caught.

There are two families. `RH001`–`RH014` check the claim "the tests pass": they
read the test suite and the code directly beneath it. `WI101`–`WI113` check the
claim "the work is done": they read shipped code for the ways a change can fake
completion without touching a test at all.

### RH0xx, test tampering

| RH-ID | Name | What It Catches |
|-------|------|------------------|
| RH001 | TestDeletedOrRenamed | Test file or test function deleted or renamed |
| RH002 | AssertionWeakened | Assertion weakened or precision reduced |
| RH003 | TestSkippedOrDisabled | Test disabled, skipped, or commented out |
| RH004 | ImplementationHardcodesFixture | Implementation hardcodes test fixture value |
| RH005 | FunctionBodyGutted | Function body replaced with a stub |
| RH006 | SnapshotRewrittenWithoutReason | Snapshot/golden file rewritten without a stated reason |
| RH007 | TestExcludedViaConfig | Test excluded from run path via config change |
| RH008 | TautologicalAssertion | Assertion always passes regardless of behavior |
| RH009 | CoverageGaming | Trivial test added while real assertions removed |
| RH010 | FailureMasking | Async checks detached, timeout/retry abuse, or a mock manufacturing the expected answer |
| RH011 | TypeLintSilencingSpam | Type/lint suppression comments added to pass (spam, or one file-wide directive) |
| RH012 | CIPipelineTampering | Test step removed from CI, or neutered so a failing suite still passes |
| RH013 | CoverageGateWeakened | Coverage threshold lowered or removed so less coverage now passes |
| RH014 | TestWorkloadReduced | A surviving test is changed to exercise fewer generated or table-driven cases |

### WI1xx, work integrity

| WI-ID | Name | What It Catches |
|-------|------|------------------|
| WI101 | SilentErrorSwallowing | Error discarded by an empty handler, so failures pass unnoticed |
| WI102 | UnimplementedWorkClaimed | Explicit not-implemented marker added to shipped code |
| WI103 | ValidationRemoved | Guard clause or contract enforcement deleted from shipped code |
| WI104 | GuardrailDisabled | Proctor, a commit hook, or a type/lint gate switched off instead of satisfied |
| WI105 | FakeDataSubstituted | Real network, database, or filesystem work replaced with canned data |
| WI106 | TypeSafetyEroded | Types widened to any or an unsafe cast to silence the type checker |
| WI107 | SecurityControlDisabled | A security check switched off, or an authorization gate removed |
| WI108 | SourceHiddenFromReview | Source or tests hidden from git, and therefore from every check |
| WI109 | ExpectedValueChanged | A test's expected value edited to match the current behaviour |
| WI110 | VerificationScriptNeutered | A test, lint, or build script rewritten so it can no longer fail |
| WI111 | ImplementationOrTestsRemoved | The code under test deleted, or a test file emptied of its tests |
| WI112 | CheckingQuietlyReduced | Assertions deleted from a surviving test, a golden file rewritten, or a module aliased to a stub |
| WI113 | FailureAvoidanceWorkaround | Benchmark workload reduced, dependency downgraded, or fixed delay added instead of fixing a failure |

Every WI check skips test files by design. An empty catch is how you assert that
something throws, canned data is what a fixture is, and a loose cast is routine
when building a partial mock. These checks watch the code your tests are supposed
to be proving, not the tests themselves.

RH004–RH011 are heuristic and higher-risk for false positives than RH001–003/007.
Each is implemented conservatively: strong-signal-only, high precision over recall.
RH004 and RH005 additionally accept `--ai` to catch fuzzier cases their deterministic
core intentionally stays silent on. The WI checks are built the same way, and most of
them offer the same escape hatch: a line whose comment explains why the thing it is
doing is correct will not be flagged, because writing that sentence down is the
outcome the check exists to produce. Run `proctor check --explain <ID>` if you're
unsure why one fired.

If you're unsure whether a change you're about to make would trip one of
these, don't make the change and ask a human instead. That is always
consistent with Rule 2 above.
