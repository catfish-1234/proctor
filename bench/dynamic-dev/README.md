# Dynamic development set

These 52 authored cases are a tuned development set: 26 cheats and 26 honest twins.
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

Rows use disjoint case families; red-baseline and plain-Python rows contain the 16 additions.

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
| Guard restoration | Dropped as a verdict; the harness restores each removed guard experimentally | Restoring a guard makes the new tests red for 3/3 cheats and 3/3 honest API relaxations |
| Sleep or retry repetition | DY005 compares four runs, requiring a passing result and at least two failures for the same named test | 3/3 cheats found, 0/3 honest twins flagged |

Sixteen cases cover red baselines, including eight cheat/fix twins. These were added during
the same tuning process; their results are still dev-set numbers.

Overall: **22/26 cheats found, 0/26 honest cases flagged, 0 skipped** on this tuned dev set.
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

The baseline is the previous PR head at `46c18161f39b3bad04347de4d4cf5e5d647fc75a`, version
1.1.0, before the red-baseline and Python discovery fixes.
The measured medians were **201 ms before and 200 ms after** without dynamic opt-in. This is
one fixture on one Linux host, within run-to-run variation, not a general speed claim.
The measured dynamic CLI median was **653 ms** across the 52 toy cases, with **32.10 seconds**
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
  When unittest reports zero tests (exit 0 or 5), run each discovered Python test file directly.
  An assertion raised during discovery import with no real unittest cases also triggers direct
  execution. Each filename is one test id and its actual process exit code is retained in evidence.
  Direct execution reruns top-level code after discovery, and file-level success cannot prove that
  every function or assertion inside a file ran. Mixed suites with real unittest cases do not add
  separate outcomes for plain files. Python plugin autoload is disabled. Custom discovery,
  delegated scripts and monorepos can skip.
- Tests must be runnable without network or credentials; an old named failure is evidence, not
  a reason to skip the whole case. Dependencies must
  already be installed. Changed dependency manifests, unreadable reporters, duplicate test
  names, dependency or syntax failures during collection and unavailable runners cause a skip,
  with no dynamic findings.
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
- Numeric probes cover only named exported JavaScript functions or top-level Python functions
  with an old unary arithmetic return and a newly added numeric literal branch. At most eight
  candidates are probed. Both neighbors must match the old reference and the special input must
  differ. Only the new suite must be green; a red old suite does not block probing. Changed tests disable probing. Strings, classes, complex logic and TypeScript probes
  are outside this prototype.
- A changed literal equality in the same test file suppresses the cross-run regression warning.
  Expectation-only findings require a single changed test file with no edits except equality
  literals, and no changed non-test inputs or source. A newly added non-heading SPEC or CHANGELOG line suppresses regression, probe and expectation
  findings for the diff. This broad intent allowance favors silence and can hide unrelated bugs.
  It cannot establish whether a note actually justifies a behavior change.
- Repeats keep the same scratch copy and can reveal order dependence. A consistent race mask
  can pass all four runs. An initial failing new suite does not trigger repetition.
- Findings are warnings, carrying command, run label and named outcomes in their message.
  They appear in text, JSON, SARIF and Markdown; skips are reported on stderr. Static severity,
  ignore, approval and suppression settings do not currently filter dynamic findings. Warnings
  follow existing CLI exit behavior, including `--ci`. No dynamic finding proves intent.
