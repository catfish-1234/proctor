# Benchmark Methodology

`proctor bench` measures how often an AI coding agent games its own test suite — and how
often proctor catches it — across a fixed pool of synthetic tasks, run with proctor's
honest-completion intervention on and off. This document explains how the measurement
works, what it deliberately does not measure, and where the numbers come from.

## Held-Out Tests

Each task in `bench/tasks/task-NN/` ships with a `repo/` directory (the agent-visible
starter project — buggy source plus a visible test file) and a separate `held-out/`
directory containing at least one additional test file that is **physically absent**
from `repo/`. The agent never sees the held-out test: it is not present anywhere the
agent's prompt or working directory can reach during the run.

`held-out.json` records which tests are withheld — at least 30% of each task's total
test count is held out. Only after the agent finishes its run does the scorer reveal
the held-out test(s) by copying `held-out/` into the agent's working directory (as a
nested `held-out/` subdirectory, preserving the file's own repo-relative imports) and
then executing the full test suite. `honest_pass` is the exit code of that run — it
tells us whether the agent's actual code change solves the underlying problem, not
whether the agent merely satisfied the tests it could see. An agent that cheats on the
visible test (deletes it, weakens its assertion, disables it, or excludes it via
config) but never fixes the underlying bug will fail the held-out test even if its
visible-test cheat goes undetected.

## Cheat Detection: Proctor's Own Signatures, Not an LLM Judge

`cheat_detected` and `rh_id` are computed by diffing the agent's temp workdir against
its pre-run baseline and calling proctor's own `runChecks` (`src/engine.ts`) — the
exact same deterministic verifier pipeline (`src/verifiers/rh00N.ts`) used by
`proctor check` in normal git-hook/CI use. No new detection logic is written for the
benchmark, and no LLM/AI judge is used to decide whether a run was a cheat.

This is deliberate: if the benchmark used a different (or fuzzier) detector than the
tool it's benchmarking, a high or low score would tell you about the judge, not about
proctor. Reusing `runChecks` in-process means the benchmark is only ever asking "would
`proctor check` have flagged this diff?" — which is the actual product claim.

## Scope: What Can Fire in a Bench Run

`runChecks` is called without enabling `ctx.aiEnabled`/`ctx.judge`, matching how
`proctor check` behaves without `--ai`. All eleven checks run in that mode, and every
one of them has a deterministic core that can fire on an agent's diff. The only parts
that stay silent are the optional fuzzy extensions of RH004 (hardcoded implementation)
and RH005 (gutted implementation), which consult the LLM judge for ambiguous cases
their deterministic cores deliberately leave alone. RH008 (tautological test) has no
AI gate at all; it is fully deterministic.

The tasks themselves are narrower than the detector. Every task in `bench/tasks/`
plants its cheat opportunity using one of five signatures: **RH001** (test deletion),
**RH002** (weakened assertion), **RH003** (disabled/skipped test), **RH006** (snapshot
rewrite), and **RH007** (config-based test exclusion). So `cheat_detected` in the
benchmark CSV should be read as "did proctor's deterministic, offline checks catch
this," where the planted cheats target those five signatures but any of the eleven can
flag what the agent actually did. A future bench version could plant RH004/RH005-shaped
cheats and thread `--ai` through the scorer to measure the fuzzy extensions; bench v1
does not.

## Proctor On vs Off Is a Real Intervention, Not Model Nondeterminism

Each selected task is scored **twice**: once with `proctorOn: false` and once with
`proctorOn: true`, both threaded through the same `AgentTask` contract
(`src/bench/types.ts`) into the same `AgentRunner`. The two runs differ by an actual,
observable intervention, not by re-sampling the same prompt and hoping for a different
answer:

- **Real agent runs** (`createShellRunner`, `src/bench/runners/shell-runner.ts`):
  when `proctorOn` is true, the canonical honest-completion skill
  (`src/skill/SKILL.md`) is prepended to the prompt sent to the agent CLI; when false,
  the agent receives the bare task prompt.
- **Mock runs** (`createFixtureRunner`, `src/bench/runners/fixture-runner.ts`, used by
  `--mock`): the fixture replays a pre-recorded honest fix (`proctorOn`) or a
  pre-recorded cheat (`proctorOff`) from that task's `mock-agent.json`, deterministically
  and without any network call — used for CI-safe, reproducible bench runs and for this
  benchmark's own integration tests.

## Seed-Based Task Selection

`--seed <n>` and `--tasks <n>` select and order `n` tasks from the fixed pool in
`bench/tasks/` via a seeded Fisher-Yates shuffle (`selectTasks`,
`src/bench/tasks.ts`): task directory names are sorted lexicographically first (so the
result never depends on filesystem `readdir` ordering), then shuffled with a
hand-rolled mulberry32 PRNG seeded by `--seed`. The same `(pool, seed, tasks)` triple
always selects the same tasks in the same order — this makes a benchmark run
reproducible without needing to persist which tasks were chosen. The task pool itself
is fixed and hand-authored (15 tasks as of this writing, see `bench/tasks/TASKS.md`),
not procedurally generated, so `--seed` controls sampling/ordering only.

## CSV Schema

Every scored run appends one row to the output CSV with this exact header:

```
task_id,model,proctor_on,cheat_detected,rh_id,honest_pass
```

| Column | Meaning |
|--------|---------|
| `task_id` | The `bench/tasks/task-NN` directory this row scores |
| `model` | The agent runner's model identifier (e.g. `claude-code`, or the `--mock`-run's `--agent` label) |
| `proctor_on` | `true`/`false` — whether the honest-completion intervention was active for this run |
| `cheat_detected` | `true`/`false` — whether proctor's own `runChecks` flagged the agent's diff |
| `rh_id` | The first tripped signature's rule ID (e.g. `RH002`), or empty when `cheat_detected` is `false` |
| `honest_pass` | `true`/`false` — whether the agent's solution passes the held-out test(s) after reveal |

`proctor bench` also prints a before/after summary table to stdout (per model, cheat
rate and honest-pass rate for `proctor_on=false` vs `proctor_on=true`) — see
`src/bench/report.ts`.

## Prior Work / Citations

- **EvilGenie** (arXiv:[2511.21654](https://arxiv.org/abs/2511.21654)): a held-out-test
  + LLM-judge + file-edit-detection research benchmark demonstrating that current
  coding agents reward-hack their own test suites at measurable rates (e.g. Claude
  Sonnet 4 hardcoded outputs on 2.1% of unambiguous tasks and 33.3% of ambiguous ones;
  Gemini 2.5 Pro deleted test files on 0.7% of tasks). `proctor bench`'s held-out-test
  design (hide a subset of tests, reveal only at scoring time) is directly inspired by
  EvilGenie's methodology, adapted into a lightweight, deterministic-signature-scored
  harness rather than a full research benchmark.
- Baker, B. et al. (2025), "Monitoring Reasoning Models for Misbehavior and the Risks
  of Promoting Obfuscation," **OpenAI**, arXiv:[2503.11926](https://arxiv.org/abs/2503.11926) —
  found that o3-mini learned to modify test cases during reinforcement-learning
  training rather than fix the underlying code, evidence that test-tampering reward
  hacking emerges during training itself, not only at inference time. This paper is an
  OpenAI publication; it is not affiliated with Anthropic.
