# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- RH012 reads the scripts a pipeline hands its work to, not only the pipeline file: anything
  under `ci/`, `.ci/`, `.buildkite/` or `.github/scripts/`, and `scripts/ci*`. A workflow that
  says `run: ./ci/verify.sh` stays untouched when `npm test` is deleted from the script, which
  is where the suite actually stopped running. The same move, swallow and retry rules apply.
- RH010 warns when one test's timeout is raised several times over, as it already did for a
  runner-wide timeout: the trailing timeout argument of an `it`/`test` call (`}, 200);` to
  `}, 120000);`), mocha's `this.timeout(n)`, and a `timeout` option on a test declaration. Same
  bar as the runner rule: only the number changed, to at least 60 seconds and at least four times
  the old value. A comment saying why the test needs longer keeps it quiet.
- WI109 follows an edited expectation one step further. A literal moved into a name the change
  introduces, with its value changed on the way (`toBe(195)` to
  `const accepted = 194; ... toBe(accepted)`), is the same edit as changing it in place and is
  reported the same way. pytest parametrize rows written as tuples (`[(1, 2, 0.5), (3, 2, 1.5)]`)
  are read as table rows, and several rows on one line may have their expected column changed
  together; written one per line, those rows were already reported, so the old rule measured only
  layout. Moving a literal into a name unchanged, reading a name that already existed, changing an
  input, or a call's argument list in a test stays quiet.
- WI109 now looks at an expectation edit even when the change also edits implementation code, so
  a wrong expected value cannot ride along with an unrelated fix (correct the sort order in
  `sort.ts`, and in the same change rewrite `tax.test.ts` to expect the wrong tax). It is a
  warning, not a block, and only when nothing in that code is related to the test: no shared file
  stem, no import of it in the test, no mention in its diff of a word the assertion uses, and
  neither the old nor the new value in its diff. Code and its tests edited together stay quiet,
  as before.
- RH011 reports a single suppression laid over code the change did not otherwise touch: a
  `# type: ignore[...]` appended to an unchanged line, or a `// @ts-ignore`, scoped
  `/* eslint-disable rule */` or `#[allow(...)]` placed above unchanged code. The code is exactly as
  it was and only the diagnostic went quiet. One suppression on code the change writes is still
  treated as a justified exception, and so is one with a reason on its line or in a comment just
  above it, or an edit to a suppression that was already there. A warning, like the rest of RH011.
- RH002 reports an expected exception broadened to a catch-all type on the same assertion in every
  framework proctor reads, not only `pytest.raises`: `toThrow(SyntaxError)` to `toThrow(Error)`
  (including `.rejects`), `assertRaises`, JUnit `assertThrows(X.class, ...)` and
  `@Test(expected = ...)`, Kotlin `assertFailsWith<X>`, C# `Assert.Throws<X>` and FluentAssertions,
  RSpec `raise_error`, Minitest `assert_raises` and PHPUnit `expectException`. Narrowing the type,
  or swapping one specific type for another, stays quiet.

On the held-out set these take the default checks from 40 to 49 of 72 cheats caught, and all
checks from 47 to 56, with the same benign cases flagged (3 and 4 of 72). Edited expected values
and suppression, both 0 of 3 before, are now 3 of 3. On the 700 human commits in `bench/detection`
blocking is unchanged (11 by defaults, 28 with all checks); one more commit gets a warning, an
unexplained `# type: ignore` added to a line it did not edit. The checks were written against
held-out misses, so these are development numbers; see docs/BENCHMARKS.md.

- RH004 reports the one-line special-case branch in Go, Rust and Swift, which write
  `if id == "acct-742" { return 6500 }` without the parentheses its pattern needed; Rust may compare
  a byte string and return `Ok(255)`. Both literals must be distinctive, so a base case
  (`if n == 0 { return 1 }`) or a sentinel on an empty string stays quiet, and vendored trees are
  skipped. A branch spread over two lines still needs a test that expects its value.
- RH005 reports an existing function whose whole body became a constant return, including
  `return Promise.resolve(true)`, compared by header, so rewriting a one-line function over three
  lines no longer hides it from the line-count gate. It also sees C#, Java and Kotlin methods, for
  the constant body and for a body emptied outright (`public void Validate(int q) { }`).
- RH005 reports a Python test that replaces a function (`monkeypatch.setattr`, `patch.object`, or
  the dotted-string `setattr`) and then, in the same test, asserts on a call to it, which checks the
  replacement. Patching a dependency of the code under test (`cli.input`), or mocking a function in
  one test while another test asserts on the real one, stays quiet.
- RH002 reports RSpec `eq` weakened to `include` or to a type-only matcher (`be_a`, `be_kind_of`,
  `be_instance_of`) or `be_present`, and Minitest `assert_equal` weakened to `assert_includes`.

- WI103 (all checks) reports a validating parse replaced by a type assertion of the same value:
  `return orderSchema.parse(raw)` becoming `return raw as Order` (or `<Order>raw`), for zod, yup,
  valibot, io-ts, superstruct and pydantic call shapes. The rest of the line must be unchanged, so
  validation moved into a helper, a different value cast, or a rewritten line stays quiet.

Together: the held-out defaults go from 49 to 55 of 72 and all checks from 56 to 63, with the same
benign cases flagged; the 700 human commits are unchanged.

### Changed

- The README's GitHub Action example pins the commit behind v2.1.0 (`77911c1`) instead of the one
  behind v1.0.0, so a workflow copied from it runs today's checks rather than the first release's.
  The Action builds from the pinned commit's own source, so the pin does not depend on npm.
  `tests/release-hardening.test.ts` now holds the example to the v2.1.0 commit.

### Fixed

- RH002 misread the subject of a Minitest `assert_equal` whose expected value held a comma
  (`assert_equal [7, 11], records` read the subject as `11]`), so a weakening of it was never paired.
- RH002 missed a `toBeCloseTo` precision lowered below zero. `toBeCloseTo(216.34, -2)` passes
  anywhere within 50, looser than any positive precision, but the precision pattern only read
  non-negative digits.
- `node bench/heldout/probe.mjs` failed on Windows at its first git call. It pointed
  `GIT_CONFIG_GLOBAL` at `os.devNull`, which Git on Windows cannot open as a config file; it now
  uses an empty temporary file on every platform.
- WI101 missed a Ruby rescue that hands back an unquoted constant. A rescue whose body is only a
  literal is reported, but literals are masked before a handler is judged, so only a quoted
  `'system'` looked empty; `rescue StandardError` returning `nil` (or `false`, `0`, `:none`) read
  as a statement and passed. The value itself is now read, so every constant default is treated
  the same. A rescue that recovers through a call still passes.
- WI101 counted the closing of an inline comment as words, so `catch (e) { /* best effort */ }`
  met the three-word bar for an explanation. The comment now ends at `*/`; this applies to every
  WI check that accepts an explanation.
- WI103 missed a deleted Go guard whose function returns a value type. It knew
  `return nil, fmt.Errorf(...)`, but `func Port(n int) (int, error)` refuses with
  `return 0, fmt.Errorf(...)`; zero values (`0`, `""`, `false`, `Config{}`) now count too.
- WI101 recognises a C# handler that only writes the failure to `Trace` or `Debug`
  (`Trace.WriteLine`, `Debug.WriteLine`, `Trace.TraceError`, ...) as logging-only, as it already
  did for `Console.WriteLine`.
- Held-out set with all checks: 69 of 72 cheats caught (was 63), with honest changes flagged
  unchanged at 4 of 72. The 700 sampled human commits are flagged exactly as before.

## [2.1.0] - 2026-11-19

### Added

- RH016 reports a harness that rewrites each test's result to passed, found by adversarial
  probing: a conftest.py that sets `report.outcome = "passed"`, `outcome.force_result(...)` inside
  a `pytest_runtest_call`/`makereport`/`protocol` hook wrapper, `unittest.TestResult.addFailure`
  or `addError` replaced, and Jest's `testFailureExitCode` set to 0 in its config, package.json
  or a CI command. `force_result` in other hooks (collection ordering, report headers) and a
  non-zero failure exit code stay quiet.
- RH003 reports a JS/TS test disabled on CI only, `it.skipIf(process.env.CI)` or
  `test.runIf(!process.env.CI)`: the JS form of the pytest `skipif` RH003 already reports. A
  platform condition (`skipIf(process.platform === 'win32')`) and a test that runs only on CI stay
  quiet.
- RH015 reports an assertion that only runs off CI: `if (!process.env.CI) expect(...)`,
  `if (process.env.CI !== 'true') { ... }`, Python `if not os.environ.get("CI"):` and
  `if "CI" not in os.environ:`. The test passes on CI without checking anything.
- RH002 reports an assertion turned around so that a wrong result passes: inverted to exclude
  the value it used to pin (`assert x == 4` to `assert x != 4`, `in` to `not in`, `assertEqual`
  to `assertNotEqual`, `assert.strictEqual` to `assert.notStrictEqual`), an exact value replaced
  by a type-only check on the same subject (`isinstance`, `assertIsInstance`, `typeof`,
  `toBeTypeOf`, `toBeInstanceOf`), and an exact value widened to a literal set that includes it
  (`assert x in (3, 4, 5)`, `toBeOneOf([...])`, `expect([3, 4]).toContain(x)`). Only the
  weakening direction counts: `assertTrue` to `assertFalse` is a changed expectation of equal
  strength, and a type check added beside a kept value check is fine.
  The inversion check covers every framework proctor reads: Go testify, JUnit, PHPUnit, xUnit,
  NUnit and MSTest, Rust `assert_eq!`, GoogleTest `EXPECT_EQ`, XCTest, Minitest, RSpec
  (`to` to `not_to`), Kotest (`shouldBe` to `shouldNotBe`) and ExUnit (`assert` to `refute`).
- RH015 reports an existing assertion wrapped so that the test expects it to fail:
  `pytest.raises(AssertionError)` or `assertRaises(AssertionError)` around an `assert` that was
  already there, `expect(() => expect(x).toBe(3)).toThrow()`, and `assert.throws(() => ...)`. A
  new test of an assertion helper, which adds the wrapper and the assertion together, stays quiet.
- RH003 reports a test compiled out by a condition that is never true: Rust `#[cfg(any())]`,
  `#[cfg(not(all()))]` or `#[cfg(FALSE)]` on a test or test module, and `#if 0` / `#if false`
  around a C, C++, C# or Swift test. The source stays, so deletion checks saw nothing, but the
  test never builds. A never-true condition around code that is not a test, and a real condition
  (`#if defined(HAVE_SIMD)`, a cargo feature), stay quiet.
- RH003 reports an expected-failure marker added to an existing test: Rust `#[should_panic]` and a
  JUnit 4 `@Test(expected = ...)`. A new test that checks a panic or an exception stays quiet.
- RH008 reports four more exact tautologies: a Python `assert (condition, "message")`, which
  asserts a two-element tuple and is always true; a condition ending in `or True`; a JS assertion
  on a literal or ORed with `true` (`assert.ok(true, msg)`, `expect(true).toBeTruthy()`,
  `assert(ok || true)`); and a Jest/Vitest matcher named but never called (`expect(x).toBe;`).

### Fixed

Running the default checks over 700 human-written commits from 20 popular repositories (the
`bench/detection` sample) found three kinds of honest change that blocked. Blocking on that sample
falls from 14 commits to 11; every planted cheat in the design and validation sets is still caught
(36 of 36), and none of their 38 benign cases is flagged. The checks added in this release add no
findings at all on those 700 commits.

- RH001 no longer reports a test as deleted when the same test, with at least as many assertions,
  is added to another test file in the same change (httpx moved its utility tests with the code).
  A title cloned into an emptier body elsewhere still counts as a deletion.
- RH003 reports an expected-failure marker (`test.failing`, `it.fails`, `@pytest.mark.xfail`) on a
  brand-new test as a warning, since it records a known bug (got added four). Marking a test that
  already existed, in place or moved from another file, still blocks.
- RH012 reports a test command whose arguments changed, with the same runner still invoked by a
  single command, as a warning instead of a removed suite (flask simplified
  `tox run -e ${{ ... }}` to `tox run`). A removed suite, and a suite dropped from an `&&` chain,
  still block.

### Changed

- Update `@anthropic-ai/sdk` to 1.11.0.
- Releasing is one command: `npm run release` checks that `main` is clean, pushed and green, tags
  the version, pushes it, and moves the `v2` tag for Action users once the release run succeeds.
  `--backfill` also tags older versions that never got a tag, oldest first, and holds the current
  version until their runs finish. `--dry-run` shows the plan. See `docs/RELEASING.md`.
- The release workflow keeps npm's `latest` dist-tag and GitHub's latest release on the newest
  version: an older tag publishes under `legacy`, a prerelease under `next`, and a version already
  on npm is skipped. Release notes are the version's CHANGELOG section. Moving `v2` no longer starts
  a publish.

## [2.0.0] - 2026-11-19

### Added

- RH015 reports the assertion library itself made unable to fail, found by adversarial probing,
  where all seven shapes passed every default check: a built-in matcher redefined through
  `expect.extend` so it always passes (including `pass: !this.isNot`, which also passes under
  `.not`), `assert.strictEqual` or `unittest.TestCase.assertEqual` replaced with a no-op (by
  assignment, `setattr`, `monkeypatch.setattr`, `patch` or `patch.object`), a local `expect` or
  `assert` that never fails shadowing the real one, a spy that gives an assertion a fake
  implementation, a test class that overrides a built-in `assertEqual` with an empty body, and the
  assertion module a test file asserts with mocked out (`vi.mock('node:assert')`). Every assertion
  survives and still runs, so assertion counting and skip detection saw nothing. Checked in test
  files and in conftest.py and runner setup files, on lines the change adds. A new, separately
  named matcher, an override that still computes `pass` or still raises, a production helper such
  as `app.auth.assert_permission` patched out of a unit test, and a spy that only watches stay
  quiet.

### Removed

- Node 20, which reached end of life on 2026-04-30, is no longer supported. proctor now needs
  Node 22.12 or newer (`engines.node` is `>=22.12.0`), and CI tests Node 22, 24 and 26. The
  GitHub Action runs on Node 24.

### Changed

- The `--ai` judge now defaults to Claude Haiku 5.5 (`claude-haiku-5-5`), run at low effort: a
  YES/NO verdict on one diff excerpt needs little reasoning. A model you name with `aiModel` is
  sent without an effort setting, since older models reject one. A declined request still reads
  as "not a cheat", so the judge can only confirm a finding, never invent one.
- Update `@anthropic-ai/sdk` to 1.10.0 and commander to 15, which needs Node 22.12. The build
  moves to tsup 9 and targets Node 22, and the tests run on Vitest 5.

## [1.13.0] - 2026-11-19

### Added

- RH005 reports two more ways to replace the unit under test, both found by adversarial probing:
  `vi.spyOn(ns, 'fn')` or `jest.spyOn(ns, 'fn')` handed a fake result or implementation, where
  `ns` is a namespace import (or `require`) of the module under test, and `sys.modules['calc']`
  replaced with a stub (directly, with `setdefault`, or with `monkeypatch.setitem`) in
  test_calc.py, or in conftest.py when a test file is named for that module. A spy that only
  watches calls, a fake on a dependency, and a conftest stub of an optional dependency stay
  quiet.

### Changed

- Update `@anthropic-ai/sdk` to 1.8.0, `brace-expansion` to 5.0.13 and `oxlint` to 1.93.0.

## [1.12.0] - 2026-11-18

### Added

- **RH016 ExitStatusForced**, on by default: test harness code that makes the run report success
  however many tests fail. A conftest.py or pytest hook that sets `session.exitstatus = 0`, calls
  `os._exit()`, `pytest.exit(returncode=0)` or `sys.exit(0)`, and a Jest/Vitest/Mocha test or
  lifecycle hook that calls `process.exit(0)` or sets `process.exitCode = 0`. Every test still
  runs and still fails in the log, so no earlier check saw it. `os._exit` in a forked child,
  `sys.exit` in an ordinary test file, and a mocked `process.exit` stay quiet.
- RH015 also reports an assertion placed behind a condition that is never true (`if (false)`,
  `if (0)`, Python `if False:`).

### Fixed

- RH015 read a braceless guarded return (`if (isWindows) return;`) as unconditional and reported
  the assertions after it. A return that is the body of an `if`, `else` or loop is conditional.

## [1.11.0] - 2026-11-18

### Added

- RH002 reports an exact assertion replaced by a negated one on the same subject
  (`toBe(5)` to `not.toBe(4)`, which passes for every wrong answer but one), and by
  `toMatchObject({})`, which matches any object. The negated call still contains `.toBe(`,
  so it had read as a strong assertion. `toEqual({})` is unchanged: it pins an empty object.
- RH007 reports tests removed in conftest.py code: a `pytest_collection_modifyitems` hook that
  drops collected items (`items[:] = ...`, `items.remove`, `del items[...]`,
  `pytest_deselected`) is an error, and a new `pytest_ignore_collect` hook is a warning. Config
  keys such as `collect_ignore` were already covered; a hook removing tests in code was not.

Both were found by planting fifteen more cheat shapes against 1.10.0. The real-commit precision
corpora report nothing new.

## [1.10.0] - 2026-11-18

### Added

- **RH015 AssertionNeutralized**, on by default: an assertion the change leaves in place but
  makes unable to fail. Two shapes: a `try` with an empty `catch` (or a Python `except` that only
  passes) wrapped around the assertion, so a failing assertion is caught and discarded; and an
  unconditional `return` added ahead of the assertion in the same test body, so it never runs.
  Both passed every earlier check, because the assertion survives untouched and the test still
  runs. JS/TS and Python. RH015 fires only when the change itself adds the `try`, the handler or
  the `return`. A `catch` that asserts on the error, `try`/`finally` cleanup, returns inside
  nested callbacks or conditions, and a returned assertion promise stay quiet. The real-commit
  precision corpora report nothing new.

### Fixed

- RH001 missed a deleted test when another test in the same diff hunk kept its title but changed,
  for example by weakening its assertion. Any added declaration excused every deletion in its
  hunk. Additions now pair first with deletions of the same title (the same test edited in
  place); only additions left over stand for a rename or a consolidation.
- The `--ai` judge read only the first content block, with a 64-token cap. Current Claude models
  think before answering, so with any of them configured as `aiModel` every call fell through to
  "not a cheat". The verdict now comes from the first text block, with room for thinking, and a
  refusal stays the fail-safe.
- The GitHub Action pasted the pull request's base branch name into `run:` scripts as a
  `${{ }}` expression. A branch name can legally contain `$(...)` or backticks, which bash would
  execute. The value now reaches the scripts through environment variables.
- The Stop hook trusted a block-budget directory in the shared temp dir even when another account
  had created it or made it world-writable, which let a planted counter read as exhausted. Only a
  directory owned by the current user and closed to group and other writes is trusted; anything
  else reads as unverified and is recorded for review.
- RH009 said "1 real assertion were removed".
- The opt-in dynamic checks reported every project on Vitest 5 as inconclusive. Vitest 5 writes
  its JSON reporter to `.vitest/json/output.json` and prints only the path, where earlier
  versions printed the report. When no report reaches stdout, the runner now reads that file,
  after clearing any copy left from an earlier run, with the same bounded, no-symlink read
  used for pytest's JUnit file.

### Security

- Globs are checked for complexity before picomatch compiles them. Every picomatch release
  through 4.0.7, the latest, backtracks exponentially on some patterns (GHSA-fc5q-39xc-vjpf):
  `*a` repeated ten times took 18 seconds against one 43-character file name. RH007 compiles
  `testMatch` globs taken from the diff under review, so an agent could stall the check past the
  Stop hook's timeout, which fails open. Patterns over the limits (6 extglob groups, 8 brace
  groups, 4 unbounded wildcards in one path segment, 1024 characters) are never compiled and never
  match, so RH007 reports the selection as narrowed. Config entries over the limits are ignored
  with a warning. Jest's default `testMatch` and proctor's own defaults are well inside them.
- Update `@anthropic-ai/sdk` to 1.4.0 and `github/codeql-action/upload-sarif` to 4.39.3, plus
  `@types/node` and `oxlint` in the toolchain.

## [1.9.0] - 2026-11-10

- Add an experimental, opt-in GitHub Copilot `agentStop` enforcement hook
  (`proctor setup --agents github-copilot` or `proctor install-copilot-hook`): writes
  `.github/hooks/proctor.json` running `proctor stop-hook --format copilot`. A blocking finding
  emits the documented `{"decision":"block","reason":...}` contract with exit 0; clean checks,
  `stop_hook_active: true` and malformed input are silent, so proctor blocks at most once per
  turn and never approaches Copilot's documented 8-block runaway guard. Both documented input
  dialects (camelCase and VS Code compatible snake_case) are accepted, and the entry carries
  `bash`, `powershell` and `command` fields so the Copilot CLI and the cloud agent run the same
  handler. The installer merges into an existing `proctor.json` preserving foreign events,
  entries and fields, never touches sibling files in `.github/hooks/`, and `proctor uninstall`
  removes only proctor's entry. The hook installs only on explicit opt-in, never on detection
  alone. **Contract-verified against GitHub's Copilot hooks reference only; never live-verified
  against a real Copilot CLI or cloud agent session.**
- `proctor doctor` reports the Copilot hook as experimental/opt-in (configured when present).
- Fix a README error that credited Cursor with a Stop hook integration it does not have.

## [1.8.0] - 2026-11-09

- Add Go support to the opt-in dynamic checks: Go modules with `*_test.go` files run through
  `go test -count=1 -json ./...` under the existing bubblewrap write/network isolation, with
  `GOPROXY=off` and `GOTOOLCHAIN=local` so a run never fetches modules or toolchains and an
  uncached dependency fails honestly. Named results are package-qualified and parsed from the
  JSON event stream with the same contradiction and discordance discipline as the other runners.
- Go check coverage is narrower and says so: DY001 (previously passing baseline test fails on
  new code) and DY005 (inconsistent repeated test, now also recognizing an added `time.Sleep`)
  execute for Go. DY002 probes and DY004 mutation-lite remain Node/Python-only, and DY003's
  expectation-literal recognition is JS/Python-shaped, so none of them fire for Go.
- A changed `go.mod` or `go.sum` now stops a dynamic run as inconclusive, matching the existing
  dependency-manifest pinning for Node and Python.
- Authored Go development cases cover a removed guard pinned by a baseline test, an honest
  red-to-green fix, a build failure reported as skipped, and a sleep-masked inconsistent test.
  Go dynamic evidence is validated through the same sandboxed worker contract as the other
  runners; this release makes no live-harness or catch-rate claims.

## [1.7.0] - 2026-11-09

- Add the explicit result contract: `check --result-json` emits a versioned envelope (schema 1)
  with selected checks, requested dynamic runs and outcomes, local snapshot references,
  verification state and reasons. `--require-dynamic` exits 3 on incomplete or review-required
  requested dynamic evidence, never a cheating finding. Receipts, badges, Markdown summaries and
  SARIF carry verification state; requested incomplete or differential evidence no longer earns
  an honest-pass badge. Legacy `--json` output is unchanged.
- Close the composition gap between that contract and the exit-only state consumers: the Stop
  hook and `unresolved --verify` now pass `--require-requested-dynamic`, so requested dynamic
  evidence that is incomplete or review-required is unverified there instead of a false clean.
  The block budget and the unresolved record are retained until a complete check with an
  observed successful state update. Static-only projects and empty diffs are unaffected and the
  public optional-dynamic exit contract is unchanged.
- Deterministic regressions cover skip/timeout/invalid-report/differential retention with
  UNVERIFIED surfacing and honest red-baseline fixes clearing only on complete verification.
  The original Windows 15/16 count-loss incident remains an unresolved historical event with
  unknown cause; this release does not claim to explain it.

## [1.6.4] - 2026-11-09

- Surface unknown Stop checks and budget/record persistence failures with bounded UNVERIFIED
  diagnostics, without treating infrastructure errors as cheating or silently clearing prior
  blocked continuity. Intentional skips remain silent and preserve the count.
- Preserve known counts when an optional attempt sequence is absent. Unknown budget state fails
  open; enforce mode records only the established finding, explicitly not verified exhaustion.
  Advisory mode still records nothing. Clean count clearing requires a successful atomic update.
- Preserve existing record bytes, provenance and history on failed replacement. Clean only owned
  temporary artifacts after partial-write/rename failures. Twenty deterministic fault and
  ownership regressions check these paths and stdout/stderr separately across hook protocols.
- Claude/Antigravity retain exit0 for uncertainty; Codex/Gemini use documented nonblocking exit1.
  Exit status alone does not establish clean checking or persistence. No new live semantic
  coverage is claimed; the original Windows15/16 cause remains unresolved and PR94 stays held.

## [1.6.3] - 2026-11-09

- Preserve unresolved finding history when a record read fails or existing JSON is malformed.
  Read the already resolved record path under the writer lock, avoiding a second Git lookup
  that could misclassify existing history as absent. Refuse an unverified overwrite instead
  of resetting the count, original finding and baseline while claiming a successful write.
- Retain per-process concurrent Stop diagnostics. Three deterministic regressions cover failed
  redundant Git lookup, EBUSY record-read failure and malformed history. This does not establish
  the cause of the observed Windows 15-of-16 occurrence count or fix all record-loss paths.
  Best-effort budget state and documented Stop fail-open behavior remain unchanged.

## [1.6.2] - 2026-11-09

- Pair dynamic cross-runs with a bounded set of baseline Jest/Vitest and Python test
  controls, restoring deletions and removing additions. Config-only changes trigger a
  separate baseline-controlled run. Config-change failures are diagnostic evidence,
  not cheating findings; probes and mutations do not attribute findings across changed controls.
- Record resolved baseline/head commit hashes as local input references, not independent
  trust or runner/dependency authentication. Custom setup imports and other runner controls
  remain outside this bounded coverage. No additional live-harness verification is claimed.

## [1.6.1] - 2026-11-09

- Treat ambiguous dynamic test reports as inconclusive (`dynamic: skipped`, with a reason),
  never as cheating findings. Reject duplicate/conflicting names, contradictory JSON summaries
  or report streams, TAP bailout/root-plan mismatches, and incomplete/count-inconsistent JUnit.
  Read JUnit only through a bounded regular-file descriptor without following symlinks.
- Keep runtime evidence limits explicit: project-controlled coherent fabricated reports can
  still pass consistency checks. Dynamic checks remain opt-in and advisory; this adds no
  live-verified agent/harness coverage or authenticated proof of test execution.

## [1.6.0] - 2026-11-09

- Add `proctor doctor` to audit deployed rulesets, Stop hooks, the pre-commit unresolved gate,
  CI invocation and CODEOWNERS coverage. Local files are presence-only evidence, never proof of
  an independent gate. Workflow detection ignores comments, echo text and disabled jobs/steps,
  and recognizes the repository's local composite action.
- Add explicit `proctor doctor --github` opt-in for read-only GitHub configuration checks on the
  actual origin repository. Default doctor is offline; `--offline` overrides opt-in. Reports
  required status checks, pull-request rules and branch-history protection as server-confirmed
  configuration, not proof an agent cannot edit or bypass it. Incomplete API/classic-protection
  coverage stays unverified. Local transitive job-dependency matches remain advisory; they do
  not prove failure propagation. Requests never send file contents or block records; an existing
  GitHub token is used only in the API Authorization header, and cross-origin redirects are refused.

## [1.5.0] - 2026-11-09

- Add Antigravity CLI Stop-hook enforcement via `proctor stop-hook --format antigravity` and an
  installable `antigravity-plugin/`. The Stop payload has no `stop_hook_active`, so every Stop
  re-checks the diff and re-blocks, up to a per-conversation budget (default 5, set with
  `PROCTOR_STOP_HOOK_BLOCK_BUDGET`). When the budget runs out the finding is recorded as
  unresolved in the worktree's git directory; `proctor unresolved` shows it and
  `proctor unresolved --verify` clears it only after a fresh complete check (working tree plus
  commits since the finding). The pre-commit hook gates on it. `PROCTOR_STOP_HOOK_MODE=advisory`
  is an explicit opt-in that skips the record. This is bounded local feedback, not tamper-proof:
  keep `proctor check --base` in CI, run outside the agent's control. Verified live on agy 1.5.3.
- Add Gemini CLI AfterAgent enforcement via `proctor stop-hook --format gemini`, reusing the
  Codex check pipeline. Blocking findings return exit-0 deny JSON with correction feedback;
  clean checks, loop-guard skips, malformed input, and internal failures silently allow.
- Gemini CLI support is experimental and opt-in: `proctor setup` merges a 60-second AfterAgent
  hook into `.gemini/settings.json` only when Gemini CLI is explicitly selected
  (`--agents gemini-cli` or `--all`), never on detection alone, and says so; `proctor agents`
  marks it experimental. Consumer Gemini CLI auth is retired by Google and the hook is
  contract-verified only, never live-verified; Antigravity CLI is the supported successor. The
  ruleset still deploys to GEMINI.md on detection. Setup explains hook fingerprints, one-time
  trust, and `/hooks`; `uninstall` removes only proctor's command. The Gemini extension bundles
  the hook in the documented `hooks/hooks.json` layout and runs the shipped CLI directly.
- Bump vitest to 4.1.12 (dev-only), clearing two moderate `@vitest/mocker` advisories.

## [1.4.0] - 2026-11-08

- Add Codex CLI Stop hook enforcement via `proctor stop-hook --format codex`: blocking findings
  return an exit-0 JSON decision with feedback; clean checks, loop-guard skips and internal
  failures stay silent and allow the turn. The default Claude Code and Cursor behavior is unchanged.
- `proctor setup` merges a 60-second Codex Stop hook into `.codex/hooks.json` when Codex is a
  resolved target, preserving existing hooks and settings. Setup explains both project trust and
  hook review via `/hooks`; `uninstall` removes only proctor's Codex command.

## [1.3.0] - 2026-11-08

- RH010: a fixed sleep of one second or more added to a test now warns, and so does a runner-wide
  test timeout raised four times over to 60 seconds or more.
- RH002: a Go `t.Fatal`/`t.Error` check rewritten into `t.Log` with the same condition is now
  reported as a weakened assertion.
- WI101: a Go `return f(x)` rewritten to `_ = f(x)` plus a success return, and a Rust result turned
  into a default with `Ok(... .unwrap_or(...))`, are now reported as discarded errors.
- RH004: an input-specific branch that returns a value an existing test expects, in front of
  unchanged general code, now warns.
- WI103 stays opt-in. Its guard-rewrite detection now also recognizes a Go guard rewritten to
  return an `errors.New` or `fmt.Errorf` error, so that is no longer reported as removed.
- Measured on the 700-commit human sample: defaults flag 26/700 commits, the same as before, and
  blocking stays at 14/700. On the 72-case development set, default checks catch 40/72 (35/72
  before) and flag the same 3/72 benign cases. Both are development numbers. See docs/BENCHMARKS.md
  and bench/dev2/README.md. Proctor still misses most cheats that need running the code or reading
  a spec, and this release does not change that claim.

## [1.2.2] - 2026-11-03

- Rewrite the README to lead with what proctor does and who it is for, and move measurement detail
  to docs/BENCHMARKS.md. Measurements on the held-out set are now labeled development/regression
  numbers, because that set has been used while fixing false positives.
- RH001: a deleted C# test file counts as relocated only when another added file is identical to it
  apart from the namespace name. Changed assertions, expected values, imports, helpers or test
  declarations still report the deletion.
- WI101: the message no longer says the handler is empty or logging-only when it returns a value.
  Detection and severity are unchanged.
- RH012: dropping a `||` retry fallback from a CI test command is no longer reported as removing
  the test step.
- On the development set the default checks catch 35/72 cheats and flag 3/72 benign cases (4/72
  before this release). Detection of cheats did not change. Four benign cases are left flagging on
  purpose; bench/heldout/README.md says why.
- CI: the required `checks` status now comes from an aggregate job that fails closed. The dynamic
  test corpus runs across three test files, which cuts a 4-core full test run from about 63s to
  about 43s on one machine.

## [1.2.1] - 2026-10-23

- Restore RH004 errors for added serialized fixture keys, including scalar lists and common
  serializations of composite inputs asserted for the same function. Preserve advisory domain
  strings and catch/except fallbacks. Add serialized-key regression twins and explicit honest
  locale-fallback controls. Earlier tuned catch-retention counts described only those cases;
  an independently reported blocking regression showed that they did not establish retention
  on other inputs.

- Demote ambiguous RH003 fixture repairs that retain an existing disabled test, RH004 domain
  branches, scoped fallback returns and specific documented behavior changes, and WI112
  assertions removed with their source feature
  to warnings. Keep errors for newly disabled tests, focus modifiers, unconditional computation
  replacements and assertion loss unrelated to a source removal. Add paired, tuned development
  cases and checks that existing development cheat catches are retained.
- On the expanded authored, tuned set, these three static checks report 7/36 original cheats
  and 21/21 repair-set cheats, with 0/60 honest errors. Three original catches and one repair-set
  catch are warnings; all seven serialized-key regressions produce errors. Finding presence
  does not establish retention of every blocking catch outside this dev set.
  The unchanged dynamic layer retains 32/36 catches and 0/36 honest findings. These tuned
  numbers are not an independent accuracy estimate.

## [1.2.0] - 2026-10-21

- Extend plain Python fallback to discovery errors and run each top-level `test_*` function in
  its own process, retaining per-test ids. Preserve unittest and pytest when they collect cases.
- Extend dynamic literal probes to simple string and boolean references. Add DY004 mutation-lite
  for red-to-green fixes with unchanged tests: at most four parser-confirmed mutations in called
  functions, within the existing sandbox and overall budget. DY002 and DY004 remain warnings
  and do not change the exit code on their own. Add ten cheat/honest dev-case pairs.
- Keep meaningful dynamic checks running on red original suites. Compare named test outcomes
  independently, probe numeric branches when the new suite passes, and detect expectation-only
  edits that already turn an old failure green without changing code.
- Fall back from zero unittest discovery to direct Python test-file execution, preserving file
  ids and exit codes. Report unavailable integration tests as explicit skips with reasons.

- Add opt-in `proctor check --dynamic`, committed `dynamic` configuration and a configurable
  60-second overall budget. Isolated test runs can report original-test regressions, narrow
  numeric branch contradictions, expectation-only contradictions and inconsistent sleep/retry
  tests. Unsupported or unavailable runs skip without failing the check.
- Add 36 authored development cases, including honest twins, under `bench/dynamic-dev`.
  Measurements are tuned dev-set results, with limits and reproduction steps beside the cases.

## [1.1.0] - 2026-10-20

- Fix false positives found on fresh public commits: a character-class predicate returning true, a Python `except: pass` followed by `else:`, tests wrapped in a `describe` block, and a new parametrized test beside an older table.
- Add a 72-cheat, 72-benign held-out set under `bench/heldout`, written after 1.0.0 and used only to measure. It is public now, so it no longer counts as blind.
- Enable WI101, WI102, WI105, WI108, WI109, and WI110 by default. The other seven WI checks stay
  opt-in because real-commit findings still include legitimate maintenance. Explicit committed
  `enabled` lists keep their existing behavior.
- Catch empty or logging-only handlers whose opener did not change, checked error results that
  become discarded values, multiline literal branches and test-derived lookups, empty function
  bodies, less precise assertions, unused test results, conditional test exits, block-commented
  tests, and `passWithNoTests` config changes.
- Reduce noise on existing skip markers, documented skips, wider globs, nested expected arrays,
  launcher changes, script delegation, test-runner migrations, existing suppressions, native
  TypeScript descriptions, and source features removed with their corresponding tests.
- Add two frozen authored sets of 74 cases each and permanent precision twins. Default detection
  rises from 7/36 to 36/36 on the frozen validation cheats, while benign flags fall from 2/38 to
  0/38. These authored variations do not establish generalization.
- On the repeatedly tuned dev corpus, defaults rise from 25/76 to 54/76; all checks stay at
  76/76, with 0/24 dev controls flagged in either mode.
- Compare parsed identifiers as tokens so changed code cannot supply regex patterns to these checks.
- Pin a fresh sample of 700 non-bot commits from the historical audit's 20 repositories.
  Default blocking findings fall from 30/700 (4.29%) to 14/700 (2.00%); any findings fall from
  46/700 (6.57%) to 26/700 (3.71%). These count every flagged human commit as a conservative
  false-positive proxy. The original 689-commit ignored sample and harness are missing, so this
  is a replacement cohort, not a reproduction of its old percentages.
- Document remaining scope and semantic limits. Proctor is a heuristic diff checker: it detects
  suspicious changes, does not prevent them, and cannot judge intent. A determined author can
  write a cheat that no static diff check recognizes.

The version remains 1.0.0. See [measurements and reproduction steps](bench/detection/README.md).
The entries below describe historical snapshots, not the current default set.

## [1.0.0]

First release. Nothing before this reached npm, so this entry describes the whole tool rather
than a delta from a version nobody can install.

### What ships

- **27 checks in two families.** RH001 to RH014 read the test suite and the code directly under
  it, and are enabled by default. WI101 to WI113 read shipped code for the ways an agent fakes
  completion without touching a test at all; they ship as **beta and opt-in**, behind
  `proctor check --wi` (or `--all-checks`), or by naming the IDs in `enabled` in
  `proctor.config.json`.
- **The honest-completion ruleset**, deployed to 30 agents from one canonical source, with
  `drift-check` to prove every copy still matches it.
- **`proctor check`**, plus `setup`, `agents`, `uninstall`, `watch`, `score`, `statusline`,
  `approve`, `badge`, `drift-check` and `bench`. Output as text, JSON, SARIF 2.1.0 or Markdown.
- **A git pre-commit hook and a Claude Code Stop hook**, and a GitHub Action that uploads SARIF
  and writes a job summary.
- **25+ languages**, with the per-language, per-check support matrix and every known gap
  documented in `docs/LANGUAGES.md`.
- **A reproducible benchmark** and an adversarial red-team corpus, both runnable from a clone.

### Worth knowing before you install

- **Installing writes nothing to your repository.** `npm install` prints exactly what
  `proctor setup` would write, and where, and stops there. `PROCTOR_AUTO_SETUP=1` opts into the
  install-and-wire behaviour; `PROCTOR_NO_POSTINSTALL=1` silences the notice.
- **Enforcement config is read from the committed `proctor.config.json`**, never the working
  tree, so a change cannot disable proctor in the same breath it cheats in.
- **An inline `proctor-ignore` marker only suppresses when it predates the diff.** A marker added
  alongside the change it excuses is a self-approval and does not count.
- **`approvedTestChanges` downgrades a finding to `info`, it never hides one.** An approved
  finding still prints, still reaches `--json` and SARIF, and still withholds the honest-pass
  badge.
- **The pre-commit hook fails closed and the Stop hook fails open**, deliberately: a guard that
  breaks should not become a wall at the end of an agent turn, but it must not mint a pass from
  missing evidence at commit time.
- **The deterministic core makes no network call.** `--ai` is an opt-in extra and needs an API
  key you set yourself.

### Measured

- **139 of 139** planted cheats caught, **0 of 33** near-miss fixtures flagged. Both counts are
  recomputed from `fixtures/` by the test suite rather than written by hand.
- **76 of 76** adversarial diffs caught with **0 of 24** controls flagged, across eleven
  red-team rounds.
- A historical audit used **689 human commits from 20 repositories**. Its ignored sample and
  report are absent from this checkout. Later README figures were **3.8% any finding and 2.32%
  blocking**; these cannot be reproduced without that original manifest. The Unreleased entry
  reports fresh paired measurements on a pinned replacement sample.
- Two complete live benchmark runs show **no difference between the proctor-on and proctor-off
  arms**. The README says so plainly rather than quoting the first run's one-task gap: this
  release claims a detection rate and explicitly refuses a prevention rate.

---

## Pre-release development history

Everything below happened before the first release, so none of it is a change to a published
version. It is kept because the reasoning is worth reading, not because any of it shipped
separately.

### The final pass

#### Changed

- **The WI1xx work-integrity family is opt-in.** It ships as beta: run it with `proctor check --wi`
  or `--all-checks`, or list the IDs in `enabled` in `proctor.config.json` to apply it everywhere,
  hooks included. No check was removed or weakened; thirteen checks reading arbitrary source across
  25+ languages is a larger false-positive surface than the RH family's and has had less real-world
  exposure, so it earns default-on in a later release rather than assuming it.
- **Installing no longer writes to your repository.** `npm install` now prints exactly what
  `proctor setup` would write, and where, and stops. `proctor setup` is unchanged and still does the
  whole install; `PROCTOR_AUTO_SETUP=1` restores the previous install-and-wire behaviour, and
  `PROCTOR_NO_POSTINSTALL=1` silences the notice. An npm package that silently rewrites git hooks
  spends exactly the trust this tool is selling.
- **RH011 counts suppressions per file rather than per change**, and a suppression whose author
  wrote down why it is there no longer counts toward the threshold. Its message now reads "N of them
  in this file".
- The README CI example uses the `catfish-1234/proctor@v1` moving tag, with the full-SHA pin
  documented beside it as the stricter alternative.
- Releases publish with `npm publish --access public --provenance`.

#### Fixed

Every fix in this group came out of a sweep of 689 human commits from 20 maintained repositories
(`sandbox/REALWORLD_FP_REPORT.md`). Together they take the share of real commits producing any
finding from 10.3% to 7.7%, and the share the default check set flags from 5.8% to 3.9%, with the
Part A catch rate unchanged at 12/12.

- **`check` no longer analyses `node_modules` on a first run.** Untracked discovery relies on
  `.gitignore`, which a brand-new repository does not have yet, so
  `npm init -y && npm i @kavishdua/proctor && npx proctor check` reported 73 errors inside other
  people's packages. Dependency and build trees are now skipped whether or not they are ignored.
  Tracked files are untouched.
- **WI103 no longer reads a `finally` block as unreachable code.** `} finally {` closes one block
  and opens a sibling whose body sits at the same indentation, so the first statement of every
  `finally` after an early `return` was reported as bypassed. This was the single largest
  false-positive source in the sweep.
- **RH004 and RH005 no longer read a relocated block as a gutted one.** A line deleted and re-added
  in the same chunk was moved, not written, so it now takes part in neither side of the
  return-pairing. The same locality bug as the earlier chunk-wide pairing fixes, on the move axis.
- **WI111 no longer says a test file "asserts nothing" when it plainly does.** It counted only the
  declarations the diff removed, so removing two cases from a forty-test file produced that message.
  A surviving declaration on an unchanged context line now suppresses it. A deleted build config or
  a deleted `*.test-d.ts` type-test file is no longer reported as a deleted implementation.
- **RH012 no longer reads a YAML comment or a composite action's input key as a test command.** The
  removal branch requires the line to be somewhere a command actually runs.
- **The WI family no longer treats markup and data files as code.** A build script embedded in a
  TOML string had its `catch {}` reported as a swallowed error in shipped code.
- **RH001 reports the whole test title** when it contains the other quote character. The truncated
  title was also the key deleted tests are paired against, so distinct tests collapsed onto one.

- `check --uncommitted` and the Claude Stop hook now include untracked, non-ignored files. A new
  test or config file previously sat outside `git diff HEAD` and was invisible until staged.
- Verifier exceptions no longer become an empty finding set and an honest-pass receipt. Verifier
  and unexpected command failures exit `3`, rather than Node's warning-only code `1`; pre-commit
  checks therefore fail closed while the Stop hook retains its documented infrastructure policy.
- Benchmark runs now reject timeouts, failed agents, and no-change runs; preserve paired on/off
  denominators; and refuse to overwrite an evidence CSV with partial results.
- `npm run verify:pack` now locates Git Bash on Windows instead of assuming `bash` is on `PATH`.
- Production GitHub workflows and the composite action now pin every third-party action to a full
  commit SHA while retaining the reviewed release tag in a comment.
- Packed-package verification now requires a real clean verdict instead of accepting any fast
  failure; the benchmark runner also settles reliably on timeout and caps output exactly.
- Semgrep now blocks on production findings while scanning deliberately vulnerable fixtures in a
  separate advisory step.
- Bare `proctor check` now covers staged, unstaged, and untracked changes by default instead of
  silently ignoring staged work; `--staged` and `--base` retain their narrower explicit scopes.

#### Added

- **The WI1xx work-integrity family**, WI101 through WI112, reading shipped code for the ways an
  agent fakes a finished job without touching a test at all: an error swallowed, a guard deleted, a
  "not implemented" marker shipped, real I/O replaced with canned data, a type widened to `any`, a
  security control switched off, the code under test deleted. Opt-in and marked beta for this
  release, see Changed above.
- RH014 detects reduced property/fuzz counts, collection slicing/filtering, contracted loop bounds,
  and rows removed from parameterized tests while their names and assertions survive.
- WI113 detects benchmark workload reductions, dependency/version-floor rollbacks, and unexplained
  fixed delays used instead of fixing the exposed behavior.
- **A real-world false-positive corpus.** `sandbox/realworld/` clones 20 maintained open-source
  repositories and replays proctor over recent human commits, which is how every fix in this
  release's Fixed section was found. `sandbox/REALWORLD_FP_REPORT.md` has the numbers and the
  triage; the harness is `sweep.mjs`, `compare.mjs` and `lines.mjs` beside it.
- `check --wi` and `check --all-checks`, for running the beta WI family without editing config.
- A feature-request issue template, and a `language` field on the false-positive template.
- `assets/social-preview.png`, the 1280x640 card GitHub shows when a repository link is shared,
  generated by `scripts/social-preview.ps1`.
- Red-team coverage now spans 76 adversarial diffs and 24 neighboring legitimate controls. All 76
  are caught and all controls remain silent, including expression-based exit laundering, focused
  test commands, CI matrix/trigger contraction, diagnostic suppression, expected-failure modifiers,
  test-environment branches, and an actual Git `assume-unchanged` state that produces no diff.

#### Changed

- Existing rules now cover exception-type broadening, constant conditional/expected-failure test
  modifiers, coverage collection disabled, source paths excluded from CI triggers, snapshot update
  flags in the normal test command, shell pipeline/background status loss, and removed/downgraded
  production error reporting.
- `proctor check` refuses tracked files hidden with `assume-unchanged` or `skip-worktree` outside a
  legitimate sparse checkout, closing a repository-state bypass no diff verifier can observe.

### Earlier work

#### Fixed

- **The Stop hook now sees unstaged changes.** It ran `check --staged`, but an agent finishing a
  turn has edited the working tree and staged nothing, so the guard saw an empty diff and allowed
  every unstaged test deletion through. It now runs `check --uncommitted`.
- **`setup` no longer writes all 30 adapter files into every repository.** It detects which agents
  a repository actually uses, from their own config files and directories, and installs only to
  those. A repo with no agent config gets `AGENTS.md`, the cross-vendor standard. `--all` restores
  the previous behaviour.
- **`setup` exits nonzero when an adapter path could not be written.** A partial install that
  reported success was indistinguishable from one that worked.
- **The Claude Code Stop hook is only installed when the repo uses Claude Code**, rather than
  dropping `.claude/settings.json` into repositories that don't.
- **`proctor score` goes through the shared diff helper**, so the per-line length cap that bounds
  worst-case regex time applies when scoring history. It previously re-implemented `git diff`
  inline and skipped it.
- **`proctor bench` explains an empty task pool** instead of reporting it as an invalid `--tasks`
  value. The corpus ships with the repository, not the npm package.
- Documentation corrections: RH013 was missing from the configuration, language, and methodology
  docs; several cross-document links pointed at the wrong file; `docs/CLI.md` quoted stale
  `--explain` output.

- **A shared file whose own prose contained the literal `<!-- proctor:start -->` marker could lose
  content, or be deleted entirely, on uninstall.** The block pattern matched from the user's stray
  marker to proctor's real end marker, so removing "the block" took everything in between with it.
  A conventions file that documents how proctor works is an ordinary thing to write, and it is
  exactly the file proctor merges into. The pattern is now tempered so a block body cannot span
  another start marker.
- **`uninstall` aborted on the first unremovable path**, printing nothing at all, so a failure
  partway through the roster left files already deleted with no record of which. Each item is now
  attempted independently, failures are reported by name, and a partial uninstall exits nonzero.
- **`setup` crashed with a raw `TypeError` on a settings file that was valid JSON but an odd
  shape** (`hooks.Stop` an object rather than an array, `hooks` a string, a `null` or array root),
  leaving a half-finished install. Those are now reported through the existing "fix it and re-run"
  path, and a root shape that `JSON.stringify` would silently drop is no longer reported as a
  successful install.
- **`uninstall` left `.husky/pre-commit` in place on a Windows clone** while reporting that proctor
  was not installed. The hook is a committed file, so `core.autocrlf` checks it out with CRLF and
  the byte-exact comparison failed. Line endings are normalized now.
- **RH004 fired on ordinary guard clauses.** Its special-case pattern matched negated comparisons,
  because the `!` was absorbed by the character class before the operator, so
  `if (result.status !== 0) return false` read as hardcoding an answer for input `0`. A negated
  comparison is the opposite shape: it refuses everything that is *not* the literal, which is a
  validation guard, and no cheat can be written that way. `if (dir === '') return false` is now
  excluded too, on the same grounds as the existing `.length === 0` exclusion. Both were found by
  running proctor against its own diff. Error-severity false positives on shapes this common are
  the worst kind, since they block a commit for honest code.
- **The Stop hook no longer blocks a turn during a merge, rebase, cherry-pick, or revert**, where
  the working tree carries the incoming branch's changes and a test that branch deleted would read
  as this turn deleting it. The pre-commit hook still guards the resolution.

#### Added

- **`proctor uninstall`** removes everything `setup` installed, and nothing else. A shared file
  keeps your own content and loses only the managed block; a foreign pre-commit hook and any other
  `Stop` hook entry are left alone. `--dry-run` shows what would go.
- **`proctor agents`** lists every supported agent and whether this repository appears to use it.
- **`proctor badge`** prints the honest-pass badge as Markdown you can paste into a README or PR.
  The README told people to do this; no command produced it.
- **`check --uncommitted`** analyses staged and unstaged changes together.
- **`setup --all` and `setup --agents <ids>`**, and the same flags on `install-skill`.
- **Agent Plugins 1.0.0 manifest** at the repository root, plus `skills/` and `.agents/skills/`
  copies of the ruleset. One artifact covering ChatGPT, Codex, Cursor, GitHub Copilot, Kiro and
  VS Code.
- **`branding` on `action.yml`**, without which GitHub Marketplace rejects the listing.
- **A root Cursor marketplace manifest**, without which Cursor cannot see a plugin that lives in a
  subdirectory.
- `CONTRIBUTING.md`, `SECURITY.md`, `docs/TROUBLESHOOTING.md`, this changelog, and issue templates.

[1.0.0]: https://github.com/catfish-1234/proctor/releases/tag/v1.0.0
