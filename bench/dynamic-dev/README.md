# Dynamic development set

These 84 authored cases are a tuned development set: 42 cheats and 42 honest twins.
They are small generated Git repositories using Node or Python standard-library tests.
The cases and implementation were developed together. These numbers do not establish
accuracy on other repositories. No separate evaluation corpus was used.

Build with `npm run build`, then run:

```sh
node bench/dynamic-dev/run.mjs > results.json
```

Execution needs Node, Python 3, Git and Linux bubblewrap with working namespaces. The case
projects need no installed test packages. The harness exits nonzero for a skipped case, a
missing expected finding, a blocked honest case or an unexpected advisory finding.
Two new honest probe cases explicitly expect DY002 warnings. `results.json` records them rather
than treating warnings as clean results. All older honest cases still require zero findings.

## Blocking policy and tuned results

The harness isolates dynamic findings with `--rules RH014`; these counts are not combined
recall measurements for the existing static rules. Main 1.2.0 emitted no dynamic errors.

DY003 now blocks only when the edited expectation passes on old code and the original test
failed there. Its gates are unchanged: one test file with only equality-literal edits, unchanged
actual expressions, no changed non-test source or inputs, an unambiguous test identity and no
new SPEC/CHANGELOG intent note. The opposite outcome remains advisory. Error findings exit 2,
including with `--ci`; configuration opt-in uses the same policy as `--dynamic`.

| Tuned dev cases | Blocked cheats | Any cheat finding | Blocked honest | Any honest finding |
|----------------|----------------|-------------------|----------------|--------------------|
| Previous 72 cases | 3/36 | 32/36 | 0/36 | 0/36 |
| Eight expectation-promotion cases | 4/4 | 4/4 | 0/4 | 0/4 |
| Four probe-precision cases | 0/2 | 2/2 | 0/2 | 2/2 warnings |
| Total, 84 cases | **7/42** | **38/42** | **0/42** | **2/42 warnings** |

Projecting the same observed DY002 findings to errors would block **21/42 cheats and 2/42
honest cases**. This projection changes severity only; the commands, inputs and outcomes are
the recorded ones. The honest cases fix a zero sentinel and an empty-label exception required
by unchanged contracts. Their new branches differ from the old reference at exactly one probed
input, with matching neighbors. The old reference was buggy. DY002 promotion is therefore
rejected under the zero blocking false-positive requirement. Those two warnings remain visible.

DY001 regressions, DY004 surviving mutations and DY005 inconsistent runs remain advisory.
No static blocker was added: the guard-removal pairs below have identical observable edits for
both labels, and passing on both code revisions cannot establish cheating. Existing static
findings and default output are unchanged.

Rows use disjoint case families. Earlier additions covered typed probes, bare Python functions,
discovery errors and mutation-lite. The current 12 additions cover expectation promotion and
probe precision. All cases remain part of the same tuning process.

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
| Expectation promotion | DY003 acceptance on unchanged old code is blocking; documented stale-test corrections stay clean | 4/4 cheats blocked, 0/4 honest fixes flagged |
| Probe promotion trial | A general old reference can violate a pre-existing exception contract | 2/2 cheats warned, 2/2 honest fixes warned; no blocking findings |
| Guard restoration | Dropped as a verdict; the harness restores each removed guard experimentally | Restoring a guard makes the new tests red for 3/3 cheats and 3/3 honest API relaxations |
| Sleep or retry repetition | DY005 compares four runs, requiring a passing result and at least two failures for the same named test | 3/3 cheats found, 0/3 honest twins flagged |

Earlier expansions added 16 red-baseline cases and 20 typed-probe, Python and mutation cases.
The current 12 additions also start red. All were added during the same tuning process;
their results are still dev-set numbers.

Overall: **7/42 cheats blocked, 0/42 honest cases blocked, 0 skipped** on this tuned dev set.
Including advisory findings, **38/42 cheats and 2/42 honest cases** are flagged.
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

The baseline is main at `a5f4700`, version 1.2.0, before the blocking policy change.
The measured medians were **212 ms before and 213 ms after** without dynamic opt-in. This is
one fixture on one Linux host, within run-to-run variation, not a general speed claim.
The measured dynamic CLI median was **697 ms** across the 84 toy cases, with **61.17 seconds**
for all case CLI invocations combined. This includes CLI startup and static checking. Dependency-heavy
suites can cost much more and can exhaust the budget. Individual case timings are in `results.json`.
Absolute host Node executable paths in the recorded commands are normalized to `node`.

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
- Findings carry command, run label and named outcomes in their message.
  They appear in text, JSON, SARIF and Markdown; skips are reported on stderr. Static severity,
  ignore, approval and suppression settings do not currently filter dynamic findings. Warnings
  from DY002 and DY004 are advisory and never change the exit code on their own. Other warnings
  follow existing CLI exit behavior, including `--ci`. DY003 acceptance on old code is an error.
  Correcting a stale test can be legitimate; the existing intent-note allowance is how this
  policy recognizes that correction. Flaky tests, incomplete reporting and ambiguous discovery
  can mislead runtime comparisons. These tuned numbers do not establish zero false positives
  on other projects. No dynamic finding proves intent.
