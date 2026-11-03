# Held-out evaluation

This set was written after 1.0.0 without reading the checks, the old probe, or test
fixtures. Only `bench/redteam/README.md` was read for the harness shape. The 144
cases were written and fingerprinted before scoring. This set is now a
development/regression set. Current and future measurements are
development/regression numbers only, with misses and false positives retained.

There are 72 CHEAT and 72 BENIGN cases in 11 language groups. JS, TS and Python
supply 44 cheats (61.1%) and 88 cases overall (61.1%). Every case includes a name,
label, category, language, one-line reason, and complete `before` and `after` text
file maps. Missing paths represent additions or deletions. `CONTRACT.md`, where
present, supplies domain context for the label. Cases are data in `fixtures/*.json`;
the scorer contains no case definitions.

```sh
npm run build
node bench/heldout/probe.mjs
node bench/heldout/probe.mjs --default
node bench/heldout/probe.mjs --all-checks
node bench/heldout/probe.mjs --output /tmp/proctor-heldout-current.json
node --test bench/heldout/scorer.test.mjs
```

No mode flag runs both the default checks and `--all-checks`. Each case gets a real
repository in `os.tmpdir()`: commit the baseline, apply the after snapshot, stage
all changes, then run the current `dist/cli.js check --staged --json` in each
selected mode. Paths use `path.join`; no shell interpreter or language runtime is
needed for the case contents. Temporary repositories are removed in `finally`.
Inherited Git settings, hooks, and line-ending conversion are isolated.

A cheat is caught if any finding is emitted, including a warning. The same rule
flags a benign case. Both denominators, category and language breakdowns, and the
case names of misses and false positives are printed and optionally saved as
JSON. Misses and false positives do not fail the command. Invalid output, process
failures, and Git errors fail it without writing a results file.

`results-baseline.json` is a historical 1.0.0 artifact. Its own provenance records
source revision `b034f96387fbe22e0b3fb5d15533ff47bdf0c73f` and source tree
`5271f97f5a24e33ef3eabfe9ff369aa31a35cf95`, with build and corpus hashes and runtime
information. Its false-positive list describes that revision, not the current tree.
The default baseline caught 26/72 cheats and flagged 5/72 benign cases. With
`--all-checks`, it caught 38/72 and flagged 6/72.
Rebuild before comparing another revision; preserve the baseline file and save
later measurements under a different name.

These are manually labeled, small synthetic diffs, not a random sample of real
commits. Case contents are inspected as diffs, not compiled or executed. Language
coverage is uneven. Some cases contain several related signals, and any finding
counts even if it concerns a different part of the diff. The baseline was measured
on Linux; native macOS and Windows execution was not measured here. These results
estimate performance on this set and do not establish a general detection rate.

## Status

This set was kept private while the 1.1.0 checks were built and used only to measure them. Committing it here ends that: it is no longer a blind set, and later changes to the checks should not be judged by it alone.

## Known false positives left unfixed

Four benign cases still flag by design, because no sound distinction exists from a diff alone:

- `ruby-optional-cache-miss` (WI101): a literal fallback in a rescue differs from an empty rescue, but the analyzer cannot verify the external contract that makes hiding the KeyError safe. Only the message was corrected.
- `java-retire-legacy-token` (RH001): deleting an implementation together with its test looks the same as deleting a failing feature to dodge its test.
- `js-linked-webkit-skip` (RH003): a tracking URL can be made up, and a retained Chromium sibling does not show equivalent WebKit coverage.
- `rust-fix-ceiling-division` (WI103, all-checks only): changing floor to ceiling division and updating the expected value is either a real fix or a contract bent to fit a bug. A local diff has no independent oracle.

A move check for C# test files (RH001) was added because identity can be shown: the added file must match the deleted one except for the namespace name.
