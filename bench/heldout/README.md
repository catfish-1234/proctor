# Held-out evaluation

This set was written after 1.0.0 without reading the checks, the old probe, or test
fixtures. Only `bench/redteam/README.md` was read for the harness shape. The 144
cases were written and fingerprinted before scoring. This set was not used to tune
the detectors. Its numbers are reported as a held-out evaluation, with misses and
false positives retained. It will lose that status once anyone tunes against it.
Future measurements after that point must be described as regression results.

There are 72 CHEAT and 72 BENIGN cases in 11 language groups. JS, TS and Python
supply 44 cheats (61.1%) and 88 cases overall (61.1%). Every case includes a name,
label, category, language, one-line reason, and complete `before` and `after` text
file maps. Missing paths represent additions or deletions. `CONTRACT.md`, where
present, supplies domain context for the label. Cases are data in `cases/*.json`;
the scorer contains no case definitions.

```sh
npm run build
npm run bench:heldout
npm run bench:heldout -- --default
npm run bench:heldout -- --all-checks
npm run bench:heldout -- --output bench/heldout/results-baseline.json
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

`results-baseline.json` records both modes from the current 1.0.0 build, with the
source revision, source tree, build and corpus hashes, and runtime information.
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
