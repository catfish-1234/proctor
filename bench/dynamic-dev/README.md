# Dynamic development set

These 72 authored cases are a tuned development set: 36 cheats and 36 honest twins.
They are small generated Git repositories using Node or Python standard-library tests.
The cases and implementation were developed together. These numbers do not establish
accuracy on other repositories. No separate evaluation corpus was used.

Build with `npm run build`, then run:

```sh
node bench/dynamic-dev/run.mjs > results.json
```

Execution needs Node, Python 3, Git and Linux bubblewrap with working namespaces. The case
projects need no installed test packages. The harness exits nonzero for a skipped case, a
missing expected finding or a flagged honest case. `results.json` records the measured run.

Rows use disjoint case families. Twenty added cases cover typed probes, bare Python functions,
discovery errors and mutation-lite. All cases remain part of the same tuning process.

| Idea | Kept behavior | Tuned development results |
|------|---------------|---------------------------|
| Original tests on new code | DY001 compares each named original test independently, including red baselines and new suites | 5/5 cheat cases found, 0/5 honest cases flagged |
| New tests on original code | Run it and note tests passing on both revisions; drop this as a standalone finding | 0/1 cheat found, 0/1 honest flagged; both outcomes are ambiguous |
| Perturbed inputs | DY002 executes an old unary arithmetic function and its new numeric literal branch at the literal and its two neighbors | 3/3 cheats found, 0/3 honest twins flagged |
| Expected-value edits | DY003 compares the edited test on old code: pass to fail or fail to pass with only an equality-literal edit | 3/3 cheats found, 0/3 honest twins flagged |
| Red-baseline probes | The new suite must pass; the old suite can fail | 2/2 cheats found, 0/2 honest fixes flagged |
| Red-baseline cross-run | Compare passing old tests even beside other old failures | 1/1 cheat found, 0/1 honest fix flagged |
| Red-baseline expectations | Gate on the edited test itself, including old failures made green by changing expectations | 2/2 cheats found, 0/2 honest fixes flagged |
| Plain Python files | Use file ids and direct exit codes when discovery finds no real cases | 3/3 cheats found, 0/3 honest fixes flagged |
| String and boolean probes | DY002 compares an executed simple reference at a string literal and two variants, or both boolean values | 5/5 cheats found, 0/5 honest fixes flagged |
| Bare Python functions and discovery errors | Isolate top-level functions with file/function ids; execute scripts after collection errors | 3/3 cheats found, 0/3 honest fixes flagged |
| Mutation-lite | DY004 deletes or negates parser-confirmed changed statements in functions observed during a green control run | 2/2 cheats found, 0/2 honest fixes flagged |
| Guard restoration | Dropped as a verdict; the harness restores each removed guard experimentally | Restoring a guard makes the new tests red for 3/3 cheats and 3/3 honest API relaxations |
| Sleep or retry repetition | DY005 compares four runs, requiring a passing result and at least two failures for the same named test | 3/3 cheats found, 0/3 honest twins flagged |

An earlier expansion added 16 red-baseline cases, including eight cheat/fix pairs. The latest
20 cases also start red and exercise typed branches, plain Python and mutation-lite. All were
added during the same tuning process; their results are still dev-set numbers.

Overall: **32/36 cheats found, 0/36 honest cases flagged, 0 skipped** on this tuned dev set.
The four misses are the three guard-removal cases and the coverage-only case. A red restored
variant is evidence that tests depend on a guard being absent; it does not establish whether
removing that guard was legitimate. The repeat fixtures deliberately exercise persistent
state and order dependence. They are not a measurement of race detection on real schedules.

## Runtime measurement

The recorded JSON files contain the individual samples and host-specific commands. The
static comparison uses a trivial source diff with identical output and exit status, 20 warm
runs per revision, interleaved after five warm-ups each. To compare two built revisions:

```sh
node bench/dynamic-dev/measure-static.mjs /path/to/baseline/dist/cli.js dist/cli.js
```

The baseline is the previous PR head at `807474a6114827e1c61bb408e1fe20ea024f35e8`, version
1.1.0, before the typed-probe, function-fallback and mutation-lite additions.
The measured medians were **206 ms before and 209 ms after** without dynamic opt-in. This is
one fixture on one Linux host, within run-to-run variation, not a general speed claim.
The measured dynamic CLI median was **689 ms** across the 72 toy cases, with **53.10 seconds**
for all case CLI invocations combined. This includes CLI startup and static checking. Dependency-heavy
suites can cost much more and can exhaust the budget. Individual case timings are in `results.json`.
Absolute host Node executable paths in the recorded commands are normalized to `node`.

## Tuned static repair twins

`repair-cases.mjs` adds 14 cheat/honest pairs for RH003, RH004 and WI112. These are authored,
tuned development cases, not an independent evaluation. `measure-repairs.mjs` runs just those
three static checks over both these 28 cases and the existing 72 cases. It compares case/rule
catches against a separately built main baseline, requires every expected new cheat finding,
and rejects any honest error. Under verification it also executes every new honest suite with
Node or Python standard libraries. Warnings are allowed. No original cases or tests were changed.

Reproduce after building main in a separate checkout and building this revision:

```sh
node bench/dynamic-dev/measure-repairs.mjs /path/to/main/dist/cli.js > before.json
PROCTOR_VERIFY_REPAIRS=1 node bench/dynamic-dev/measure-repairs.mjs dist/cli.js before.json > after.json
```

The environment-variable assignment above uses POSIX shell syntax. The harness uses
`os.tmpdir()` and `path.join()` for scratch paths. It needs Git, Node and Python 3.
The repair-precision workflow runs this comparison, the existing dynamic set and the full suite.
Raw measurements and the measured revisions are in [repair-results.json](repair-results.json).

Tuned results for the **three selected static checks**, comparing main with this change:

| Cohort | Cheat catches before / after | Cheat errors before / after | Honest errors before / after |
|--------|-----------------------------|-----------------------------|------------------------------|
| Existing 36 cheat / 36 honest cases | 7 / 7 | 7 / 4 | 3 / 0 |
| Added 14 cheat / 14 honest twins | 14 / 14 | 14 / 13 | 13 / 0 |

All prior case/rule catches remain. Three existing string/boolean branches and one added domain
branch become warnings because their diff shapes also describe honest repairs. Across the two
cohorts there are **0/50 honest errors** from these three checks. This does not measure other
static verifiers or establish zero false positives on other projects.

| Added twin family | Tuned cheat catches | Tuned honest errors |
|-------------------|---------------------|---------------------|
| RH003 skipped fixture setup | 3/3, all errors | 0/3 |
| RH004 locale fallback and documented behavior | 7/7, 6 errors and 1 warning | 0/7 |
| WI112 channel removal | 4/4, all errors | 0/4 |

The unchanged dynamic checks still find **32/36 cheats**, with **0/36 honest findings** and
**0 skips** on the original tuned set. The worker and dynamic gates are unchanged.
The hosted Linux run passed **76 test files and 1,922 tests**, without skips, plus build,
typecheck, lint and the PR-range self-check.

On the separate default CLI timing fixture, output and exit status were identical. Twenty
warm runs per revision, interleaved after five warm-ups each, measured medians of **226.9 ms
before and 226.4 ms after**. This is a tuned single-fixture measurement on one hosted Linux
runner, within run-to-run variation. It is not a general performance claim.

Limits: these gates read diff evidence, not the full project contract. A skip must have enough
context to bind to the old test; Python class names distinguish same-named methods. Scoped
fallback matching needs visible control flow. A behavior note must name the changed function
or both special-case literals and include a recognized behavior word. This matches words and
identifiers; it cannot assess the quality or truth of the note. Unrelated notes do not qualify.
Source removals must match the test module, the removed function or dispatch arm, and every
lost assertion. Rebound functions and unrelated removals do not qualify. Dispatch matching
covers simple quoted equality arms in JavaScript and Python, plus JavaScript switch cases.
Missing context and unsupported syntax can prevent a repair from matching. Notes can be
misleading, and source removal cannot establish authorization. These ambiguous cases stay
visible as warnings. Existing warning exit policy and explicit severity overrides still apply.

## Exact prototype limits

- The default path runs no project tests. `dynamic: true` comes from the committed baseline
  config; the flag also enables it. Static check selection does not enable dynamic execution.
- Node supports `node:test` directly for JavaScript and through a recognized `npm run test`
  script. Jest and Vitest run through that script with JSON reporters and single-run options.
  Node scripts use `NODE_OPTIONS=--test-reporter=tap`. Python supports unittest discovery
  from the repository root and pytest through `python3 -m pytest` with a JUnit report.
  With no real unittest cases, zero discovery or collection errors trigger direct execution.
  Files with top-level `test_*` functions run one function per fresh process by importing the module
  and calling it, including async functions. Each `file::function` is a test id. Other scripts run
  as `python3 <file>`, using the filename as id. Commands and actual exit codes remain in evidence.
  Duplicate function names in one file skip. Direct execution reruns top-level code after discovery;
  functions requiring fixtures or custom arguments are unsupported. Mixed suites with real unittest
  cases do not add separate outcomes for plain files; collection errors beside real cases still skip.
  Python plugin autoload is disabled. Custom discovery,
  delegated scripts and monorepos can skip.
- Tests must be runnable without network or credentials; an old named failure is evidence, not
  a reason to skip the whole case. Dependencies must
  already be installed. Changed dependency manifests, unreadable reporters, duplicate test
  names and unavailable runners cause a skip. Plain-script dependency or syntax errors become
  direct-file failures, without manufacturing a green result or a finding merely for being red.
  The runner does not install anything. Unsupported languages report a not-run note.
- Snapshots use the index for `--staged`, HEAD plus the reported files for working changes, and
  the merge base with HEAD for `--base`. Hybrid snapshots replace test files, not whole source
  files. Fixture data outside test globs, inline tests and renamed imports can defeat cross-runs.
- Tests and probes run only in scratch copies made with `os.tmpdir()` and `path.join`.
  Dependencies are copied, with no hardlinks or links back to the working tree. Tracked
  symlinks, submodules and external dependency symlinks cause a skip. Host mounts are read-only;
  bubblewrap isolates network and PID namespaces. This is write and network confinement,
  not a confidentiality boundary against hostile tests reading host files.
- The entire worker, including Git reads and dependency copies, has one 60-second default
  budget. `--dynamic-timeout` or `dynamicTimeoutMs` changes it. Cleanup follows termination.
  Timeout, normal exit, SIGTERM and SIGKILL descendant cleanup are tested. SIGKILL can leave
  a scratch directory because the parent cannot perform filesystem cleanup after being killed.
- Windows and macOS report a skip until equivalent isolation is implemented. Missing or
  restricted bubblewrap also skips. There is no unconfined fallback.
- Literal probes cover named exported JavaScript functions or top-level Python functions with
  a simple unary return: arithmetic, identity, boolean negation, string concatenation or selected
  case/whitespace methods. Branch inputs and results can be numbers, strings or booleans.
  At most eight candidates are probed. Two string/numeric variants, or the other boolean, must
  match the old reference; only the special input may differ. The new suite must be green and
  tests unchanged; a red old suite does not block probing. Escaped string literals, classes,
  complex expressions and TypeScript are outside this scope.
- Mutation-lite runs only for a red old suite and green new suite with unchanged tests and no
  documented intent. A separate green control records called functions using native V8 coverage
  or Python's profile hook. At most four added/modified statement lines are deleted or negated,
  one at a time in the same scratch copy, with the source restored after each run. JavaScript uses
  Acorn; Python uses `ast` and an unparse/parse round trip. Parsed trees must differ only by the
  intended mutation. Statements and conditions already present in the old parsed tree are skipped,
  including formatting and comment edits. Only whole single-line statements and simple conditions/returns qualify.
  Removed lines, unsupported syntax, decorated Python functions, missing coverage and large
  line diffs are skipped. Transforms and custom profilers can hide function ranges. The suite
  must preserve exactly the same named passing results under a mutation and a restored control.
  Surviving mutations show no demonstrated test protection, which can also mean redundant code
  or behavior deliberately outside the test contract. They cannot prove intent. All control and
  mutation runs share the existing overall timeout; timeout still discards incomplete findings.
- A changed literal equality in the same test file suppresses the cross-run regression warning.
  Expectation-only findings require a single changed test file with no edits except equality
  literals, and no changed non-test inputs or source. A newly added non-heading SPEC or CHANGELOG
  line suppresses regression, probe, expectation and mutation findings for the diff. This broad
  intent allowance favors silence and can hide unrelated bugs.
  It cannot establish whether a note actually justifies a behavior change.
- Repeats keep the same scratch copy and can reveal order dependence. A consistent race mask
  can pass all four runs. An initial failing new suite does not trigger repetition.
- Findings are warnings, carrying command, run label and named outcomes in their message.
  They appear in text, JSON, SARIF and Markdown; skips are reported on stderr. Static severity,
  ignore, approval and suppression settings do not currently filter dynamic findings. Warnings
  from DY002 and DY004 are advisory and never change the exit code on their own. Other warnings
  follow existing CLI exit behavior, including `--ci`. No dynamic finding proves intent.
