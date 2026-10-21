# Dynamic development set

These 36 authored cases are a tuned development set: 18 cheats and 18 honest twins.
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

| Idea | Kept behavior | Tuned development results |
|------|---------------|---------------------------|
| Original tests on new code | DY001 warns when a previously passing named original test fails while the new suite passes | 5/5 cheat cases found, 0/5 honest cases flagged |
| New tests on original code | Run it and note tests passing on both revisions; drop this as a standalone finding | 0/1 cheat found, 0/1 honest flagged; both outcomes are ambiguous |
| Perturbed inputs | DY002 executes an old unary arithmetic function and its new numeric literal branch at the literal and its two neighbors | 3/3 cheats found, 0/3 honest twins flagged |
| Expected-value edits | DY003 compares an original passing literal equality with the edited failing equality on unchanged source | 3/3 cheats found, 0/3 honest twins flagged |
| Guard restoration | Dropped as a verdict; the harness restores each removed guard experimentally | Restoring a guard makes the new tests red for 3/3 cheats and 3/3 honest API relaxations |
| Sleep or retry repetition | DY005 compares four runs, requiring a passing result and at least two failures for the same named test | 3/3 cheats found, 0/3 honest twins flagged |

Overall: **14/18 cheats found, 0/18 honest cases flagged, 0 skipped** on this tuned dev set.
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

The baseline is main at `d2ae15756c9fe474772859ece4a80d22a9d82be1`, version 1.1.0.
The measured medians were **209 ms before and 208 ms after** without dynamic opt-in. This is
one fixture on one Linux host, within run-to-run variation, not a general speed claim.
The measured dynamic CLI median was **670 ms** across the 36 toy cases, with **23.46 seconds**
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
  Python plugin autoload is disabled. Custom discovery, delegated scripts and monorepos can skip.
- Baseline tests must be runnable and green without network or credentials. Dependencies must
  already be installed. Changed dependency manifests, unreadable reporters, duplicate test
  names, collection failures and unavailable runners cause a skip, with no dynamic findings.
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
  differ. Changed tests disable probing. Strings, classes, complex logic and TypeScript probes
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
