# Why proctor exists, and how it's built

This doc is for people who want the deeper reasoning behind proctor, or who are thinking about
contributing and want to understand the architecture before touching code. If you just want to
use proctor, the [README](README.md) has everything you need and you can skip this.

## The problem

AI coding agents are graded on whether tests pass. That creates an obvious shortcut: instead of
fixing the bug, delete the test, weaken the assertion, or hardcode the expected output. The tests
go green, the agent reports success, and nobody notices until the bug ships.

This isn't a hypothetical. EvilGenie, a research benchmark from AI labs studying this exact
failure mode, measured it directly: Claude Sonnet 4 hardcoded outputs on 2.1% of unambiguous
tasks and 33.3% of ambiguous ones. Gemini 2.5 Pro deleted test files outright on 0.7% of tasks.
Those numbers are why proctor exists.

## Is the premise supported by published research?

Yes, and by more of it every quarter. The question worth asking is which specific claim each paper
supports, because they are not all the same claim.

**That agents tamper with tests specifically.** This is the claim proctor's checks are built on,
and it is the best supported.

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

**What nobody has published, and what we therefore still owe.** Every paper above measures how
often agents cheat. None measures whether a deterministic diff-level guard reduces it. That gap is
ours to close, and it is the honest reason proctor's README claims a detection rate (125 of 125
planted cheats caught, 0 of 18 near-misses flagged) rather than a prevention rate. The benchmark
work needed for a prevention claim is scoped in
[`bench/METHODOLOGY.md`](bench/METHODOLOGY.md): tasks 16 through 22 exist precisely because the
first fifteen were too easy to produce a measurable cheat rate in either arm.

One adjacent result is worth watching. **CapCode/CapReward**
(arXiv:[2606.07379](https://arxiv.org/abs/2606.07379)) detects cheating statistically, by capping
the achievable pass rate so that a score above the cap is itself evidence. That is a complementary
detector to proctor's: it needs a controlled dataset and catches cheats proctor's syntactic
signatures would miss, while proctor needs no dataset and runs on an ordinary repository's diff.

## How proctor is different from adjacent tools

A few tools solve problems that sound similar but aren't the same problem:

- **Stryker** (and mutation testing generally) mutates your *implementation* to check whether your
  tests would actually catch a bug. Proctor does the opposite: it checks whether your *tests* got
  mutated to hide a bug that's still there. Same neighborhood, inverse direction.
- **EvilGenie** proves the cheating happens and measures how often, but it's a research benchmark
  built for AI labs to study models, not something you install as a guard in your own repo.
- **loki-mode** has a test-mutation gate, but it's bundled inside a full autonomous SDLC framework.
  You have to adopt loki's entire workflow to get it. It can't run as a standalone git hook in an
  existing repo.
- **METR and similar vendors** mitigate this internally with proprietary classifiers that look at
  model internals. That's not something a normal developer can install or inspect.

Proctor fills the specific gap none of those cover: a deterministic guard that reads the diff, not
the model, runs as a normal git pre-commit hook or Claude Code Stop hook, needs no LLM and no
network by default, and requires zero changes to how you prompt your agent. Because it works at
the diff layer, underneath whatever reasoning the agent did to get there, the agent can't talk its
way around it. It either produced a clean diff or it didn't.

Test tampering is the wedge, not the whole product. The real goal is broader: proving an agent
did what it claims instead of just trusting what it says. That's why the core abstraction (below)
is built around a generic "claim vs. reality" check, not a test-specific one.

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
- **`Context`**: the working or staged diff, the repo's file tree, a map from tests to the code
  they exercise, parsed config, and an optional AI judge. Built once per `check` run by
  [`buildContext()`](src/context/index.ts).
- **`Finding`**: `{ verifierId, severity, file, line, message, suggestion }`. What a verifier
  produces when it catches something.
- **`Receipt`**: `{ status: "honest-pass" | "caught", findings, timestamp }`. The final outcome of
  a run. This is what drives the badges.

Two rules the whole codebase follows: the deterministic core never touches the network (`--ai` is
opt-in and only ever adds checks, never replaces the default behavior), and every verifier is a
pure function over `Context`, so each one can be unit-tested against the fixtures in
[`fixtures/`](fixtures) without any of the others running.

## What the RH codes mean

Every check has an ID like `RH001` or `RH006`. The letters don't stand for anything you need to
remember. They're short, stable labels so you can reference one specific check in config, in
`--rules`, or in CI output, without typing a full sentence every time. Think of them the way you'd
think of an ESLint rule ID: a lookup key, not something to memorize.

You'll always see the plain-English name and a description alongside the code (in `proctor check`
output, in `--explain`, and in the [CLI reference](docs/CLI.md)), so you never
have to guess what a code means. Run `proctor check --explain RH001` to print the full explanation
for any rule.

## Where this could go next

Test tampering is only the first category of claim proctor checks. The `Verifier` interface was
built so a future verifier for a different kind of dishonesty (an agent silently swallowing an
error, quietly dropping a requirement, or claiming a spec is done when it isn't) can be added
without touching the core. None of that is built yet. If you're interested in contributing one,
start by reading a couple of the existing verifiers in `src/verifiers/` to see the pattern, then
open an issue to talk through the design before writing code.

## More detail

- [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md): the full benchmark methodology, the held-out-test
  design, and citations.
- The dogfooding runs behind the [known limitations](docs/LANGUAGES.md#known-limitations): four rounds against a local
  corpus of 28 scratch repos, which is where the false positives and false negatives listed there
  were found and fixed. Those repos and their reports are working notes rather than a deliverable,
  so they live outside the published tree.
