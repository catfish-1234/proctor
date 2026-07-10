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
output, in `--explain`, and in the [README's CLI reference](README.md#cli-reference)), so you never
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
- [`sandbox/DOGFOOD_REPORT.md`](sandbox) through `DOGFOOD_REPORT_v3.md` (not shipped in the
  published package, but in the source repo): the real testing process that found and fixed the
  false positives and false negatives described in the README's Known Limitations section.
