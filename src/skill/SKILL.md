# Proctor Skill: Honest Completion Ruleset

This is the canonical L1 skill for any AI coding agent working in a repository
that uses `proctor`. It applies to every agent turn that touches test files or
the code those tests exercise. Copy of this document is deployed verbatim to
every supported agent's conventional skill/rule path (see `src/adapters/registry.ts`)
— do not hand-edit deployed copies; edit this file and run `proctor install-skill`.

## 1. The 5 Core Rules

These rules are non-negotiable. They apply regardless of how much pressure
there is to show a green build.

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
5. **A fix is not done until the original, unaltered tests pass** — or a
   human has explicitly approved a change to the test itself. Passing tests
   you weakened, skipped, or replaced does not count as done.

## 2. The Guard That Enforces This

These rules are not just values or prose to keep in mind — they are backed by
a deterministic enforcement mechanism. `proctor`, a deterministic diff-level
guard, runs on every commit and on every agent turn (via the Claude Code Stop
hook and the git pre-commit hook) and will block on any error-severity
violation of the rules above. If you delete, skip, or weaken a test, or
hardcode/gut the implementation behind it, `proctor` inspects the diff — not
your reasoning about the diff — and stops the commit or turn before it lands.
There is no way to reason around it from inside the agent's own context,
because it operates below that layer, directly on the diff.

Concretely: `proctor check --staged --ci` runs after every agent turn ends. If
it finds an error-severity finding, the turn is blocked and the finding is
reported back to you to fix honestly. Treat a block from this guard as the
guard doing its job, not as a bug to work around.

## 3. Rule Reference

Each row below is sourced verbatim from `RULE_METADATA` in `src/rules.ts` —
the same registry the tool itself uses to report findings. If you see one of
these rule IDs (`RH001`–`RH011`) in a `proctor` finding, this table tells you
what it caught.

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
| RH010 | FailureMasking | Timeout/retry abuse, or a network mock manufacturing the expected answer |
| RH011 | TypeLintSilencingSpam | Type/lint suppression comments added to pass (spam, or one file-wide directive) |

RH004–RH011 are heuristic and higher-risk for false positives than RH001–003/007.
Each is implemented conservatively — strong-signal-only, high precision over recall.
RH004 and RH005 additionally accept `--ai` to catch fuzzier cases their deterministic
core intentionally stays silent on. Run `proctor check --explain <RH-ID>` if you're
unsure why one fired.

If you're unsure whether a change you're about to make would trip one of
these, don't make the change and ask a human instead — that is always
consistent with Rule 2 above.
