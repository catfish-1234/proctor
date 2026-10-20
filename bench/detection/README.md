# Detection and precision measurements

Measured on October 20, 2026. Baseline: `b034f96387fbe22e0b3fb5d15533ff47bdf0c73f`, version 1.0.0.
The version is unchanged. Machine-readable counts are in [results.json](results.json).

## What was measured

| Set | Cases | Before defaults | After defaults | Before all checks | After all checks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tuned dev cheats, existing redteam probe | 76 | 25 | 54 | 76 | 76 |
| Tuned dev controls | 24 | 0 flagged | 0 flagged | 0 flagged | 0 flagged |
| New design cheats | 36 | 7 | 36 | 9 | 36 |
| New design benign twins | 38 | 2 flagged | 0 flagged | 2 flagged | 0 flagged |
| Frozen validation cheats | 36 | 7 | 36 | 9 | 36 |
| Frozen validation benign twins | 38 | 2 flagged | 0 flagged | 2 flagged | 0 flagged |

A detection means at least one finding, including warnings. Both new sets were written before
changing detectors, and committed separately. [frozen.sha256](frozen.sha256) records their bytes.
Validation contained 74 cases. Its baseline and final totals were measured after freezing it;
its cases were not changed or used to select detector changes. Design and separate precision
regressions drove development. The two new sets contain paired naming and literal variations,
so they are small authored tests, not a representative estimate of future detection.

The existing 76-case redteam corpus has been tuned on repeatedly. It is a dev regression set,
not independent evidence of generalization. The separate owner evaluation was not accessed.

## Human commits and the default gate

The original 689-commit sample and harness could not be found in the tracked `scripts/` or
`bench/` trees, their tracked history, or this checkout's ignored artifacts. The historical
report at commit `300ee10`, `PRELAUNCH_REPORT.md`, says they lived in ignored
`sandbox/realworld/` and `sandbox/REALWORLD_FP_REPORT.md`. It names the repositories and describes
35 recent non-merge commits per repository. The README's old 2.32% blocking and 3.8% any-finding
figures cannot be independently reproduced without that original manifest. They are historical
claims, not measurements of this change.

[human-sample.json](human-sample.json) pins a fresh sample: 35 non-merge commits with one parent
from each of those same 20 repositories, before October 20, 2026 UTC. Bot identities are excluded
by the documented script filter. All 700 selected commits are retained, including every finding. This cohort spans seven language
groups; C# handling has authored-case coverage here but no human-commit coverage.
Each entry pins its repository, commit, parent, and patch SHA-256. This is a replacement cohort,
not a recovered copy of the original 689 commits. Sampling non-bot identities does not establish
how any particular commit was written or why it changed behavior.

| Mode | Before blocking | After blocking | Before any finding | After any finding |
| --- | ---: | ---: | ---: | ---: |
| Defaults | 30/700 (4.29%) | 14/700 (2.00%) | 46/700 (6.57%) | 26/700 (3.71%) |
| All checks | 46/700 (6.57%) | 30/700 (4.29%) | 64/700 (9.14%) | 44/700 (6.29%) |

These are conservative false-positive proxies: every flagged human commit counts, even an
intentional test deletion that the rule correctly describes. They are not adjudicated rates of
wrong accusations. Findings from different rules overlap and must not be added together.
The final defaults meet the historical percentage ceilings as well as improving on the
unchanged baseline replayed on the identical fresh cohort. A different cohort prevents a direct
paired comparison with the old 689-commit figure.

### Default decisions

| Check | Human commits with findings after changes | Decision |
| --- | ---: | --- |
| WI101 | 1 | Default. Adds no new flagged commits to the RH set; closes unchanged-opener and propagated-error gaps. The one silent promise handler also has an RH finding. Its intent remains a review question. |
| WI102 | 0 | Default. Explicit unfinished-body markers; no observed additional findings. |
| WI105 | 0 | Default. Existing structural IO replacement and test-environment signals; no observed additional findings. |
| WI108 | 0 | Default. Source hiding signals; no observed additional findings. |
| WI109 | 0 | Default. Test-only expectation edits, with implementation-backed updates kept quiet. |
| WI110 | 0 | Default after recognizing called script helpers and runner migrations, and excluding publication commands from verification. |
| WI103 | 11 | Opt-in. Guard extraction, control flow, and partial context still cause noise. |
| WI104 | 1 | Opt-in. Deleting an unrelated shared instructions file can be legitimate. |
| WI106 | 7 | Opt-in. Legitimate type changes still produce warnings. |
| WI107 | 2 | Opt-in. TLS implementation changes need more context. |
| WI111 | 7 | Opt-in. A partial diff does not prove an entire test file is empty. |
| WI112 | 3 | Opt-in. Cleanup assertions, moved checks, and removed tests can confuse file-wide counts. |
| WI113 | 2 | Opt-in. Dependency rollback can be legitimate maintenance. |

RH002 now also catches a narrow removed-result-assertion shape, so that case no longer requires
WI112. The result must still be computed in the same surviving named test and have no remaining
use. Moving the check into a helper retains a use and stays quiet.

Precision fixes preserve old disabled tests, native skip reasons, equivalent CI invocations,
complete parameter-table structure, existing suppressions, native TypeScript descriptions, and
coordinated removal of a referenced source feature in its corresponding unit. Permanent small
regressions cover these patterns and suspicious neighbors. Detectors use language syntax and framework APIs, not corpus case names or identifiers and
values from these fixtures.

## Reproduce

Install the locked development dependencies first with `npm ci`. From the repository root:

```sh
node scripts/build-detection-core.mjs work/core-before.mjs b034f96387fbe22e0b3fb5d15533ff47bdf0c73f
node scripts/build-detection-core.mjs work/core-after.mjs
node scripts/evaluate-detection.mjs work/core-before.mjs bench/detection/design.json work/design-before.json
node scripts/evaluate-detection.mjs work/core-after.mjs bench/detection/design.json work/design-after.json
node scripts/evaluate-detection.mjs work/core-before.mjs bench/detection/validation.json work/validation-before.json
node scripts/evaluate-detection.mjs work/core-after.mjs bench/detection/validation.json work/validation-after.json
node scripts/sample-human-commits.mjs
node scripts/evaluate-human-commits.mjs work/core-before.mjs work/human-commits work/human-before.json
node scripts/evaluate-human-commits.mjs work/core-after.mjs work/human-commits work/human-after.json
npm run build
node bench/redteam/probe.mjs --default --out work/dev-default-after.json
node bench/redteam/probe.mjs --out work/dev-all-after.json
```

For the old dev defaults, build a CLI snapshot with
`node scripts/build-detection-core.mjs work/cli-before.mjs b034f96387fbe22e0b3fb5d15533ff47bdf0c73f cli`,
then pass its absolute path to the probe's `--cli` option together with `--default`.
The probe rejects malformed output and infrastructure failures. Replaying the pinned human
sample needs public GitHub access and Git. Snapshot builds read only source and package files.
The scripts use Node paths and temporary directories on every operating system.

## Limits

Proctor is a heuristic diff checker. It detects suspicious changes; it does not prevent them or
judge intent. A determined author can write a cheat that no static diff check recognizes.
A reason can document a legitimate exception but cannot prove the change is correct.

Structural scanning is not a complete parser or a type checker. It needs enough of a handler,
function, test callback, or parameter table inside the diff hunk to establish its scope. A Rust
fallback is suspicious here when it replaces propagation of the same operation; an arbitrary
new `let _ =` or `unwrap_or_default` could consume a non-error value and is left alone. Go
blank returns require evidence of a removed nil-error check on the corresponding binding.
Multiline literal branches and lookup hardcodes require a matching asserted input/output pair
in visible test diff context and a related computation in the same function. Tables outside
that shape, indirect imports, custom assertion helpers, hidden task graphs, and semantic cheats
can still escape. None of these measurements establish a prevention rate or a generalization
rate for unseen cheats.
