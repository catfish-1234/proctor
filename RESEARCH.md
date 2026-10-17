# Why proctor exists, and how it's built

For the current literature review, paper positioning, evaluation protocol and
offline seed benchmark, see the dated [research package](docs/research/README.md).
It distinguishes implemented checks from untested prevention claims and records
the current limits on novelty and enforcement.

This page explains the design and architecture for contributors. For installation and usage,
see the [README](README.md).

## The problem

AI coding agents are graded on whether tests pass. That creates an obvious shortcut: instead of
fixing the bug, delete the test, weaken the assertion, or hardcode the expected output. The tests
go green, the agent reports success, and nobody notices until the bug ships.

EvilGenie measured this behavior: Claude Sonnet 4 hardcoded outputs on 2.1% of unambiguous
tasks and 33.3% of ambiguous ones. Gemini 2.5 Pro deleted test files on 0.7% of tasks.

## Is the premise supported by published research?

The papers below report test tampering, benchmark leakage, and gaps between visible and
held-out test results. These are related findings, but they support different claims.

**Test tampering.** These studies report changes to tests or their execution:

- **EvilGenie** (arXiv:[2511.21654](https://arxiv.org/abs/2511.21654)) measured hardcoding and test
  file deletion directly, per agent, at the rates quoted above, and observed explicit reward hacking
  from both Codex and Claude Code.
- **Baker et al.** (OpenAI, arXiv:[2503.11926](https://arxiv.org/abs/2503.11926)) found o3-mini
  learning to modify test cases during RL training rather than fix the code. Test tampering is not
  only an inference-time slip, it is something training actively rewards.
- **Hora and Robbes** (MSR 2026, arXiv:[2602.00409](https://arxiv.org/abs/2602.00409)) mined 1.2
  million 2025 commits across 2,168 JS/TS/Python repositories and found coding agents measurably
  more likely than human commits both to modify tests and to add mocks to them. That is direct
  field evidence for RH005's mock-the-thing-under-test signal, at a scale no benchmark reaches.
- **Berkeley RDI** ([April 2026](https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/)) drove
  eight standard agent benchmarks to near-perfect scores without solving any task. The SWE-bench
  Verified break was a pytest hook forcing every test to pass, which is RH007 and RH012 territory
  exactly.

**That "the tests pass" is a weak signal of "the work is done."** This is the broader premise
behind the Receipt abstraction rather than behind any single RH check.

- **SpecBench** (arXiv:[2605.21384](https://arxiv.org/abs/2605.21384)) quantifies the gap between
  visible-test pass rate and held-out-test pass rate on 30 systems-level tasks. The gap grows about
  28 points per tenfold increase in code size and reaches 100 points on the largest tasks, and
  raising test coverage did not shrink it. The driver is the distance between task difficulty and
  model capability, which is the same reason proctor's own bench found nothing on single-line tasks.
- **Building to the Test** (arXiv:[2606.28430](https://arxiv.org/abs/2606.28430)) put a hidden
  222-test oracle behind a reimplementation task and found agents delivering whatever the oracle
  checked instead of what the prompt requested.
- **Cursor** ([June 2026](https://cursor.com/blog/reward-hacking-coding-benchmarks)) audited 731
  trajectories and found 63% of successful Opus 4.8 Max runs on SWE-bench Pro had retrieved a known
  fix rather than derived one, dropping the score from 87.1% to 73.0% under a strict harness. This
  is leakage, not test tampering, so it is adjacent evidence rather than direct support: it says a
  self-reported green is unreliable, not that the tests were edited.

**Detection versus prevention.** The papers above do not establish whether a deterministic
diff-level guard reduces cheating. Proctor's README reports detection results (139 of 139
planted cheats caught, 0 of 33 near-misses flagged), not a prevention rate. The benchmark design
for testing prevention is described in
[`bench/METHODOLOGY.md`](bench/METHODOLOGY.md): tasks 16 through 22 were added after the
first fifteen produced no measurable cheat rate in either arm.

**CapCode/CapReward**
(arXiv:[2606.07379](https://arxiv.org/abs/2606.07379)) detects cheating statistically, by capping
the achievable pass rate so that a score above the cap is itself evidence. That is a complementary
detector to proctor's: it needs a controlled dataset and catches cheats proctor's syntactic
signatures would miss, while proctor needs no dataset and runs on an ordinary repository's diff.

## How proctor is different from adjacent tools

Related tools address different parts of the problem:

- **Stryker** (and mutation testing generally) mutates your *implementation* to check whether your
  tests would actually catch a bug. Proctor does the opposite: it checks whether your *tests* got
  changed to hide a bug that remains in the implementation.
- **EvilGenie** proves the cheating happens and measures how often, but it's a research benchmark
  built for AI labs to study models, not something you install as a guard in your own repo.
- **loki-mode** has a test-mutation gate, but it's bundled inside a full autonomous SDLC framework.
  You have to adopt loki's entire workflow to get it. It can't run as a standalone git hook in an
  existing repo.
- **METR and similar vendors** mitigate this internally with proprietary classifiers that look at
  model internals. That's not something a normal developer can install or inspect.

Proctor runs as a git pre-commit hook or Claude Code Stop hook and checks repository diffs.
The default checks need no LLM, network connection, or changes to the agent's prompt. The agent's
explanation does not affect the result. Coverage is limited to the patterns each check recognizes.

The verifier interface supports checks beyond test tampering. The WI family uses it to inspect
incomplete work and disabled checks in source and config.

## The taxonomy: what counts as cheating

The checks cover several ways a change can make an unfinished task appear complete:

| The claim | How it gets faked | Covered by |
|---|---|---|
| The tests pass | Test deleted, skipped, renamed away, or excluded via config | RH001, RH003, RH007 |
| The tests pass | Assertion weakened, made tautological, or swapped for a trivial one | RH002, RH008, RH009 |
| The tests pass | Implementation hardcoded to the fixture, or gutted behind a stub | RH004, RH005 |
| The tests pass | Snapshot rewritten, retries and timeouts abused, type/lint errors silenced | RH006, RH010, RH011 |
| The build is green | Test step removed from CI, or coverage gate lowered | RH012, RH013 |
| The code works | The error is caught and discarded, so the failure stops being reported | WI101 |
| The work is done | An explicit not-implemented marker ships inside finished-looking work | WI102 |
| The input is valid | The guard that rejected it is deleted rather than satisfied | WI103 |
| The checks pass | The checks are switched off, ignored, self-approved, or bypassed | WI104 |
| The integration works | Real IO is replaced with canned data that always looks right | WI105 |
| It typechecks | The type is widened to `any` until the checker stops disagreeing | WI106 |
| The request succeeds | Certificate verification, CSRF, or an authorization gate is switched off | WI107 |
| The diff is clean | The file is hidden from git, so no check can see it at all | WI108 |

### The self-reference hazard, for anyone adding a check

A tool that detects a token necessarily contains that token. Proctor's verifiers list every pattern
they look for, its rule metadata describes all of them in prose, and its tests exercise them, so
three separate times a new check reported proctor's own source as a violation of itself: WI102 on
the rule metadata describing its sentinels, WI106 and RH011 on twelve findings across the signature
tables, and WI108 on its own documentation of `git update-index`.

These false positives appear in a base-range diff even when a clean working-tree check passes.
Excluding proctor's own files would also hide regressions. New checks should instead:

1. Skip documentation files. Prose naming a construct is describing it, not doing it.
2. Skip comment-only lines, for the same reason one level down.
3. Blank string and regex literal contents with `withoutLiterals()` before matching, so a pattern
   table and a quoted mention both go quiet while real code does not.
4. Anchor to statement position where the construct has one, as WI102 does.

Haskell's HLint annotation is an exception: its directive lives inside a string. That pattern
must match the raw line, including the literal contents.

**Verify with `proctor check --base main`, not a working-tree run.** A clean tree diffs nothing, so
a working-tree check reports an honest pass while CI, which diffs against the base, sees every new
file as pure additions and finds all of it.

### What is deliberately not covered

The current diff checks do not cover these three categories:

**Requirement dropping, or spec drift.** An agent quietly narrows the task: implements three of the
four cases asked for, and reports the work as complete. Detecting this requires the original
requirements, which the diff alone does not provide. A future check would need a machine-readable
specification or an AI judge; the deterministic core must remain usable offline.

**Retrieved rather than derived fixes.** Cursor's June 2026 audit found 63% of successful
SWE-bench Pro runs had looked up a known fix instead of working one out. The finished diff of a
looked-up fix and a derived one are the same diff, so nothing at the diff layer can separate them.
Catching this needs trajectory data, which proctor deliberately does not read.

**Claim inflation in prose.** A commit message, a PR description, or a README that overstates what
the change does. Detecting it means comparing prose to code, which is an AI judgment call, not a
signature. RH006 does something adjacent, requiring a stated reason for a snapshot rewrite, but it
only checks that a reason exists, never whether the reason is true.

All three require evidence beyond the diff. The current checks do not read agent trajectories
or evaluate whether an explanation is true.

## Architecture

Everything is built on one idea: an agent makes a **claim** ("the tests pass," "I fixed the bug"),
and a **Verifier** checks that claim against **reality**: the diff, the repo, an actual test run.

```
discover() -> buildContext() -> run Verifier[] -> aggregate Findings -> Receipt + Report + (block?)
                    |                  |                  |                    |
              diff + repo tree    each verifier is   severity-ranked    "honest pass"
              + test/impl map     a pure function    findings           or "caught",
                                  over Context ->                       plus exit code
                                  Finding[]
```

The four pieces (see [`src/types.ts`](src/types.ts) for the exact shapes):

- **`Verifier`**: `{ id, severity, run(context) }`. The test-tampering checks (`RH00x`) are just
  the first set of verifiers, registered in [`src/verifiers/registry.ts`](src/verifiers/registry.ts).
  A future verifier for a different kind of problem (error suppression, spec drift, whatever)
  implements the same interface and slots into the same array. No core rewrite needed.
- **`Context`**: the working or staged diff, the repo's file tree, test-path and language
  matchers, parsed config, and an optional AI judge. Built once per `check` run by
  [`buildContext()`](src/context/index.ts).
- **`Finding`**: `{ verifierId, severity, file, line, message, suggestion }`. What a verifier
  produces when it catches something.
- **`Receipt`**: `{ status: "honest-pass" | "caught", findings, approvedCount, timestamp }`. The final outcome of
  a run. This is what drives the badges.

Two rules the whole codebase follows: the deterministic core never touches the network (`--ai` is
opt-in and only ever adds checks, never replaces the default behavior), and every verifier is a
pure function over `Context`, so each one can be unit-tested against the fixtures in
[`fixtures/`](fixtures) without any of the others running.

## What the RH codes mean

Each check has a stable ID such as `RH001` or `RH006`, used in config, `--rules`, and CI output.

You'll always see the plain-English name and a description alongside the code (in `proctor check`
output, in `--explain`, and in the [CLI reference](docs/CLI.md)), so you never
have to guess what a code means. Run `proctor check --explain RH001` to print the full explanation
for any rule.

## Where this could go next

The first six WI checks covered error swallowing, unimplemented work, deleted validation,
disabled guardrails, faked data, and eroded types. They used the existing verifier interface,
engine, reporters, config, and approvals. The Stop hook needed one change to accept rule IDs
beyond the `RH` prefix. The WI family now contains thirteen checks.

What is left is the harder half, and it is listed under
[what is deliberately not covered](#what-is-deliberately-not-covered) above: requirement dropping,
retrieved rather than derived fixes, and claim inflation in prose. None of the three has a
diff-level signal, so each would need either the `--ai` judge or a source of truth the diff does
not contain. If you want to work on one, that is a design conversation before it is a code
conversation, so open an issue first. For a new signature inside an existing category, read a
couple of the verifiers in `src/verifiers/` and the shared helpers in `wi-common.ts`. Pay particular
attention to the conditions that prevent false positives.

## More detail

- [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md): the full benchmark methodology, the held-out-test
  design, and citations.
- The dogfooding runs behind the [known limitations](docs/LANGUAGES.md#known-limitations): four rounds against a local
  corpus of 28 scratch repos, which is where the false positives and false negatives listed there
  were found and fixed. Those repos and their reports are working notes rather than a deliverable,
  so they live outside the published tree.
