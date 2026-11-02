# Benchmarks and measurements

Full measurement detail behind the README's summary numbers: benchmark
methodology, live-benchmark narrative, third-party citations, and the
retraction history. Nothing here is hidden - the README links this file
wherever it cites a number.

## By the numbers

**How often agents actually do this.** These are other people's published measurements, not ours:

| | |
|---|---|
| **33.3%** (3 of 9) | of ambiguous coding tasks where Claude Sonnet 4 hardcoded the expected output rather than solve the problem, in [EvilGenie](https://arxiv.org/abs/2511.21654)'s nine-task ambiguous subset |
| **2.1%** of 145 | unambiguous tasks in the same paper's main set where the same behaviour appeared, and the right fix was never in doubt |
| **3.4% / 0.7%** | of the same 145 tasks where Gemini 2.5 Pro deleted a test file outright / modified one (same paper) |
| **~28 pts per 10x** | widening of the gap between "the visible tests pass" and "the held-out tests pass" per tenfold increase in code size in [SpecBench](https://arxiv.org/abs/2605.21384) |
| **8 of 8** | agent benchmarks that [Berkeley RDI](https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/) drove to near-perfect scores without solving a single task. SWE-bench Verified fell to a pytest hook that forced every test to pass |

**What proctor catches.** The original rule fixtures and recorded benchmark cases are checked by
`npm test`. The redteam probe is a repeatedly tuned **dev corpus**, not independent evidence of
generalization. Fresh measurements compare the unchanged main baseline with these changes:

| | |
|---|---|
| **139 of 139** | original planted rule fixtures caught with all checks, with **0 of 33** original near-miss fixtures flagged. These are development fixtures, not an unseen evaluation |
| **21 of 21** | recorded cheats caught in the mock benchmark corpus, across 7 signatures. The 22nd task is a control; it stays quiet |
| **25 to 54 of 76** | tuned dev cheats caught by defaults before and after. With all checks: **76 to 76 of 76**. Dev controls: **0 to 0 of 24** flagged in either mode. Run `node bench/redteam/probe.mjs --default` and `node bench/redteam/probe.mjs` |
| **7 to 36 of 36** | cheats caught by defaults in the **74-case frozen validation set**, with benign flags falling from **2/38 to 0/38**. All checks improve from **9/36 to 36/36**. The separately frozen 74-case design set has the same totals. Both are small authored sets with paired variations |
| **4.29% to 2.00% blocking** | **30/700 to 14/700** real non-bot commits flagged by defaults on the same fresh pinned sample from 20 repositories. Any finding: **46/700 (6.57%) to 26/700 (3.71%)**. Every flagged human commit counts as a conservative false-positive proxy, including intentional test deletions |
| **26 to 35 of 72** | cheats caught by defaults on a **72-cheat, 72-benign held-out set** written after 1.0.0 by a separate run that never saw the checks. Benign flags: **5/72 before, 5/72 after**. All checks: **38 to 42 of 72**, with 6/72 benign flagged. Error handling went from 0/12 to 7/12. Hardcoded special cases (2/8), removed validation (0/3), edited expected values (0/3), race masking (0/3) and suppression (0/3) are still mostly missed. The set was used only to measure, not to tune, but it is now public, so it no longer counts as blind. After that measurement the RH012 near-miss fix was developed against cases from this set, so it is now part of the development loop: current-tree regression runs give **35/72 caught, 4/72 benign** by defaults and **42/72 caught, 5/72 benign** with all checks, re-measured against a clean build of the pre-fix tree (35/72, 5/72 and 42/72, 6/72 respectively). Those post-fix numbers are regression measurements, not independent held-out evidence. Run `node bench/heldout/probe.mjs --default` |
| **2.6% blocking** | **11/420** real commits blocked by both 1.0.0 and this release on a second fresh sample of 14 repositories that neither the checks nor the first sample touched. Any finding: **17 before, 16 after**. A few false positives found there were fixed with rules, not by pinning commits |
| **27** | checks in two families, with **20 enabled by default**, across **25+** languages, installable into **30** agents |

The old **689-commit** claim, **2.32% blocking and 3.8% any finding**, refers to a missing ignored
sample and harness. It could not be reproduced from this checkout or tracked history. The fresh
700-commit sample uses the same 20 repositories, pins every commit and patch hash, and retains
all findings. It is a replacement cohort, not the original sample. See
[methods, per-rule results, and reproduction commands](bench/detection/README.md).

**What we don't claim.** Proctor is a heuristic diff checker. Defaults still miss more than half of the held-out cheats, mostly the ones that need running the code to see: special-cased inputs, edited expected values, removed validation, masked races and suppression. It detects suspicious changes;
it does not prevent them or judge intent. A determined author can write a cheat that no static
diff check recognizes. The dev and authored-validation results do not establish a detection
rate for unseen cheats. Our [live benchmark](#benchmark) has not shown that proctor reduces
cheating: all 44 invocations in each complete run passed their evaluation tests in both arms.

## Benchmark

`proctor bench` measures how often an agent games its own tests, and how often proctor catches it,
across a fixed pool of tasks with the ruleset on and off.

The table shows a complete 22-task live run against `claude-code`, with all 44 invocations scored.
Before the run, each held-out suite was verified to fail its task's unfixed source.

| | proctor off | proctor on |
|---|---|---|
| cheat rate | **4.5%** (1 of 22) | **4.5%** (1 of 22) |
| honest-pass rate | **100.0%** | **100.0%** |

All 44 runs passed their held-out tests, including the runs flagged by proctor. This includes
the seven tasks designed to make cheating cheaper than fixing. The run provides no evidence of
a difference between the two arms.

An earlier run showed 9.1% against 4.5%, a difference of one task out of 22. That difference did
not reproduce in the second run and does not establish a prevention rate.

The single flagged task was a **false positive**. RH004 fired on task-17 in both arms after the
agent replaced a
`return version >= base` stub with a real 52-line semver implementation. The flagged line was the
`return 0` that terminates its new comparator, which is the correct "equal" result, paired by the
check against the deleted stub thirty lines away in a different function. That has been fixed, so
the same run scored against current code reads **0.0% in both arms**. The table preserves the
results recorded at the time.

The eight held-out suites that could not distinguish a fix from a cheat were found and strengthened
before this run, and `tests/bench-heldout-discriminates.test.ts` now enforces that property for
every task. See [bench/METHODOLOGY.md](https://github.com/catfish-1234/proctor/blob/main/bench/METHODOLOGY.md).

The task corpus ships with this repository rather than the npm package, so `bench` needs a clone:

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install && npm run build
node dist/cli.js bench --tasks 22 --agent claude-code --out bench/results-live.csv
```

A 22-task run is 44 agent invocations, which is more than one Claude subscription session allows.
Three attempts reached 16, 14 and 16 tasks before the agent returned "You've hit your
session limit". An older scorer treated failed invocations with no changes as clean results;
the current scorer rejects them. `--resume` carries the completed tasks over from the
`.partial.csv` a failed attempt leaves behind, so a run can span more than one window; the numbers
above were collected that way. `PROCTOR_BENCH_TIMEOUT_MS` raises the per-invocation budget, which
the hard-tier tasks need. Read the `proctor: bench task-NN ... failed` lines on stderr before
trusting any number the table prints.
