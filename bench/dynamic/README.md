# Runnable dynamic corpus

This set was written independently after 1.1.0, without reading the checks or
`src/`, `tests/`, `bench/redteam/`, `bench/heldout/`, or `bench/detection/`.
It was not used to tune the checks. It loses held-out status once anyone tunes
against it. Cases were fixed before measurement. Nothing under `src/` changed.

There are 40 cheats and 40 honest changes, with 20 Node and 20 Python projects
in each kind. Every case uses only standard libraries and needs no network.
Use Node 20 or newer and Python 3. The static runner also requires git and the
repository's installed dependencies and built CLI. `PYTHON` can select a Python
3 executable; on Windows the default is `python`.

```sh
npm run build
npm run bench:dynamic
node --test bench/dynamic/runner.test.mjs
```

Build fails if a snapshot command or hidden probe disagrees with its case.
`npm test` includes the one corpus test, which runs only snapshot commands and
hidden probes. `node bench/dynamic/run.mjs --validate` validates without git or
static checks. Build and tests do not overwrite the saved result reports.

Each `case.json` declares `name`, `kind`, `category`, `lang`, `why`, `test_cmd`,
`expected_exit`, and `probe.verify_cmd`. Commands are single executable commands
encoded as argv arrays, without shell parsing. Run `test_cmd` inside `before/`
or `after/`. A base exit of 1 is an intentional failing suite. Every after suite
exits 0. Copy `hidden/` into a fresh after tree only for scoring, then run
`probe.verify_cmd`: cheats must exit 1 and honest cases must exit 0.

Tests and probes run in separate fresh trees. Hidden files never enter ordinary
test trees or static repositories. Validation rejects probe syntax and import
errors, timeouts, and abnormal termination. `results-validation.json` records
all 240 observed exit statuses.

The runner commits `before/` in a throwaway git repository, replaces it with
`after/`, stages the full change including deletions, and runs the public CLI:

```sh
node dist/cli.js check --staged --json <temporary-repository>
node dist/cli.js check --staged --json --all-checks <temporary-repository>
```

Temporary roots use `os.tmpdir()` and `path.join()` and are cleaned up after use.
A nonempty JSON findings array counts as flagged, including warnings. Missing
or malformed JSON fails the run. `results-static.json` records findings, exit
statuses, category totals, version, and source commit.

| Check set | Caught cheats | Flagged honest |
| --- | ---: | ---: |
| Default | 6/40 | 3/40 |
| `--all-checks` | 9/40 | 4/40 |

For the next stage, `run.mjs` exports `loadCases`, `withCaseRepository`,
`withSnapshot`, `runCommand`, `validateCase`, `validateCorpus`, and `runStatic`.
`withCaseRepository(item, callback)` passes `{tree, base}` with after staged
against the committed before snapshot. `withSnapshot(item, side, callback)`
provides an isolated snapshot. Its fourth argument, `{scoring: true}`, copies
in hidden files. Callbacks must finish using trees before returning. Keep labels
and probes away from the detector. The runner does not exchange tests between
versions or implement the future dynamic detector.

These small synthetic projects do not estimate production prevalence or accuracy.
Layouts are shared, probes cover narrow contracts, and race schedules are short
and controlled. Honest labels depend on documented local specs. Four cases skip
one unavailable integration fixture each while keeping core coverage; their
issue links are illustrative. Commands were validated on Linux with Node 24 and
Python 3.12. Windows and macOS execution remains unverified. Static findings do
not prove behavior, and no dynamic detection rate is claimed.
