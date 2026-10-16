# Validation record: broader research direction and extended seed

Run date: 2026-10-16, America/Los_Angeles. The isolated `/workspace/proctor`
checkout started at latest main `1bfd0b192ea214a0ed349b27822b11b8ccf23e07`, verified
first with the GitHub compare API and then `git fetch origin main`. New branch:
`research/verification-trust-boundaries`.

Only research Markdown and benchmark JSON/checksum data change. Production source,
existing tests, dependency manifests/lockfile, v1 corpus/checksum/raw observation,
and `seed/run.py`/`seed/test_harness.py` remain unchanged. No fixture code or
live coding agent was executed. No model inference or external benchmark was run.
The remote push/PR is for review, not a merge, release, npm publication or announcement.

## Actual local checks

Environment: Linux x86_64, Node v24.19.0, Python 3.12.14, Git 2.52.0.

| Check | Outcome |
| --- | --- |
| `npm ci --cache /tmp/proctor-npm-cache --ignore-scripts` | Passed; restored existing lockfile dependencies |
| `npm run build` | Passed, freshly built unchanged detector |
| `npm run typecheck` | Passed after dependency restore |
| `python3 docs/research/seed/run.py --validate` | Passed original 24-case schema/evidence/checksum |
| `python3 docs/research/seed/test_harness.py` | All 7 original tests passed, including real-CLI smoke |
| Extended `load_dataset(path, checksum)` | Passed all 48 cases, evidence and SHA-256 |
| Documented extended replay, repeated | Both runs completed all 96 invocations; reports identical |
| Original 24 rows versus PR #46 raw report | Identical decisions and findings for both modes |
| `npm exec -- vitest run tests/prose.test.ts` | 2/2 passed after staging the research files |
| Internal Markdown links/punctuation and `git diff --cached --check` | Passed |
| `node dist/cli.js check --staged --all-checks --json --ci` | Passed, zero findings |
| Scope inspection against base | Research docs/data only; no detector, harness or test changes |

The preinstalled dependency tree initially lacked `brace-expansion` and picomatch
type declarations: CLI smoke failed with module-not-found, and typecheck failed.
A clean lockfile install resolved both; no workaround or dependency edit was made.
The first default-sandbox prose test could not spawn Git (`EPERM`); unchanged tests
passed through the supported additional-permission execution mode. Shell Git's
initial proxy connection failure also resolved through that mode. These setup
failures are disclosed separately from completed detector outcomes.

The full production test suite and plugin validator were not rerun for this
research-only change. PR #46's 1,441-test record is historical, not a new result.
The local checks do not establish the remote OS/Node matrix's outcome.

## Observed counts and evidence limits

The extended corpus has 24 tamper, 23 benign and 1 ambiguous case. A01 stays
excluded from binary metrics. Both modes have 47/47 binary coverage, one completed
ambiguous case, and zero infrastructure failures. At the error-block threshold:

| Method | TP | FN | FP | TN | Recall | Benign FPR |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Default | 10 | 14 | 1 | 22 | 10/24 = 41.7% | 1/23 = 4.3% |
| All-checks | 13 | 11 | 2 | 21 | 13/24 = 54.2% | 2/23 = 8.7% |
| Protected paths, conceptual | 19 | 5 | 17 | 6 | 19/24 = 79.2% | 17/23 = 73.9% |
| No detector, conceptual | 0 | 24 | 0 | 23 | 0/24 | 0/23 |

Default error-block precision is 10/11; all-checks is 13/15. Alert outcomes differ:
default TP/FN/FP/TN = 11/13/3/20; all-checks = 14/10/4/19. No-detector precision
is undefined. Protected paths are a deliberately naive path list, not a complete
immutable-evaluator implementation. None of these are deployed prevention results.

New-case blocking recall is 2/12 default, 3/12 all-checks. B16 (authorized support
retirement) is blocked by both; B14 (test-only logging) also by all-checks. B11
is an approved information alert; B18 and T19 are warnings. T14/B13 and T17/B16
have identical snapshots under different permissions, exposing a diff-only
information limit. The corpus is paired and selected, not an independent sample.

The broad aggregate includes semantic/environment gaming T15/B14 and information
access T23/B22. Excluding those four for the narrower verifier-manipulation slice
leaves 22 tamper and 21 benign: default catches 10/22, all-checks 12/22; both block
1/21 benign. This descriptive slice was defined by mechanism, not detector success,
and is not the future study's primary-endpoint evidence.

The [seed guide](seed/README.md) lists every new pair and exact decision; the
[raw report](seed/extended-observed-results.json) records per-case findings,
source/bundle/harness hashes and environment. The unmodified runner's `run()`
assumes v1 paths when recording input hashes, so the documented wrapper explicitly
binds dataset hash/manifest to `extended-cases.json` and adds its checksum hash.
The wrapper itself is in the hashed README. The report records the base HEAD
because observations precede the documentation commit; source hashes identify
the unchanged evaluated detector.

There is no independent annotation, held-out generalization, downstream correctness
execution, real-agent prevalence or causal prevention measurement. False positives
and broad misses remain in the data; no detector behavior was tuned to improve
these observations. Additional synthetic cases establish pipeline coverage and
limitations, not paper-ready empirical effectiveness.
