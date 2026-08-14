<p align="center">
  <img src="assets/proctor-logo.svg" alt="proctor logo, a watchful eye with a green checkmark pupil" width="96" height="96">
</p>

<h1 align="center">proctor</h1>

<p align="center"><strong>Your agent didn't fix the bug. It deleted the test and told you it passed. proctor catches it.</strong></p>

proctor reads your git diff and blocks the changes an AI coding agent makes when it fakes a
finished job: deleting a failing test, weakening the assertion, hardcoding the answer, swallowing
the error, or switching off the checks that were about to catch any of it.

No network, no account, no API key. The whole check runs offline. You need Node 20 or newer.

## Contents

**Getting started**

- [Quickstart](#quickstart), try it against a repo without installing anything
- [Install](#install), one command per agent
- [What that setup does](#what-that-setup-does)
- [One thing to do afterwards](#one-thing-to-do-afterwards)
- [Checking it worked](#checking-it-worked)
- [Removing it](#removing-it)

**Using it day to day**

- [See it catch a real cheat](#see-it-catch-a-real-cheat)
- [What happens when it blocks](#what-happens-when-it-blocks)
- [What do the codes mean?](#what-do-the-codes-mean)
- [Badges](#badges)
- [CI](#ci)

**Why it works**

- [How it works](#how-it-works)
- [Can the agent get around it?](#can-the-agent-get-around-it)
- [By the numbers](#by-the-numbers)
- [Benchmark](#benchmark)

**Reference**

- [Going further](#going-further), every doc page
- [The Proctor](#the-proctor)
- [License](#license)

## Quickstart

The npm package is not published yet: `npm view @kavishdua/proctor` currently returns 404, so an
`npx @kavishdua/proctor ...` command from the registry will not work. Until the first release, run
the checked-out source against any git repository:

```bash
git clone https://github.com/catfish-1234/proctor.git
cd proctor
npm ci
npm run build
node dist/cli.js check /path/to/repository
```

If it prints `✓ proctor: honest pass`, your current changes are clean. If your changes don't touch
tests at all, that's the answer you should expect.

The check writes nothing to the repository being checked and makes no runtime network call.
`npm ci` installs build dependencies only in the proctor checkout.

## Install

Pick your agent. One command, and you are done.

**Claude Code**

```
/plugin marketplace add catfish-1234/proctor
/plugin install proctor@proctor-marketplace
```

**Gemini CLI or Qwen Code**

```bash
gemini extensions install https://github.com/catfish-1234/proctor
qwen extensions install https://github.com/catfish-1234/proctor
```

**Anything else** (30 agents supported, or none at all)

Until the npm package is published, build its installable tarball from source:

```bash
# In the proctor checkout
npm ci
npm run build
npm pack

# In the repository proctor should guard; use the .tgz path printed above
npm install --save-dev /absolute/path/to/kavishdua-proctor-*.tgz
```

That is the whole install. proctor sets itself up as it installs: it works out which agents this
repo uses, writes the ruleset to those, installs the git pre-commit hook, and installs the Claude
Code Stop hook if this repo uses Claude Code. There is no second command.

It stays out of the way where setting itself up would be wrong: in CI, in a global install, when
pulled in as somebody else's dependency, outside a git repository, or under `npx`. In each case it
says which one applied and stops. `PROCTOR_NO_POSTINSTALL=1` turns it off entirely, and
`npx proctor setup` runs it by hand whenever you want after the local tarball is installed.

### What that setup does

Three things, and then it tells you what it did:

1. Works out which agents this repository actually uses, by looking for their config
   (`.cursor/`, `.claude/`, `WARP.md`, and so on), and writes the ruleset to just those. A repo
   with no agent config gets `AGENTS.md`, the cross-vendor standard.
2. Installs a git pre-commit hook, so a cheat can't be committed.
3. Installs the Claude Code Stop hook, if this repo uses Claude Code, so a cheat is caught at the
   end of the turn rather than at commit time.

Run `proctor agents` first if you want to see what it will write. `--all` installs to all 30
supported agents; `--agents claude-code,cursor` names them yourself.

### One thing to do afterwards

**Commit what it wrote.** The ruleset files and `.proctor-adapter-manifest.json` are ordinary files
in your repo, and they only reach your teammates and your CI once they're committed.

```bash
git add -A && git commit -m "chore: add proctor"
```

If you use Claude Code, restart it so it picks up the new Stop hook.

That's the whole setup. You don't need to run proctor by hand, remember any flags, or write a
config file.

### Checking it worked

```bash
proctor drift-check   # exits 0 if every deployed ruleset copy still matches the source
proctor statusline    # "proctor: watching", or "proctor: 3 caught" once it has blocked something
```

Or trip it deliberately: delete a test in a scratch branch and run `proctor check`.

### Removing it

```bash
proctor uninstall --dry-run   # see what would go
proctor uninstall
```

It removes only what it installed. Your own content in a shared file like `AGENTS.md` stays, a
pre-commit hook that isn't proctor's is left alone, and `proctor.config.json` is left for you to
keep or delete. To skip the hook once without uninstalling: `git commit --no-verify`.

## See it catch a real cheat

An agent is asked to fix a bug in a slug generator. It can't get the whitespace-only case to
return `''`, so instead of fixing `slugify()`, it deletes the inconvenient test:

```diff
 describe('slugify', () => {
   it('converts spaces to dashes', () => {
     expect(slugify('Hello World')).toBe('hello-world');
   });
-  it('handles a whitespace-only input', () => {
-    expect(slugify('   ')).toBe('');
-  });
 });
```

```
$ proctor check
tests/slug.test.ts
  ❌ tests/slug.test.ts:5  [RH001]  Test function 'handles a whitespace-only input' was deleted in this change.
      Restore the deleted test or document why it was intentionally removed.

How to fix these honestly:
  proctor check --explain RH001 --fix

1 finding (1 error, 0 warnings)
$ echo $?
2
```

The commit never lands. The agent has to actually fix `slugify()`, not just make the red go away.

Here's the full two-scene recording: proctor catching a deleted test at the CLI layer, then the
Claude Code Stop hook blocking the same cheat live in an agent session.

![proctor demo](assets/demo.gif)

## What happens when it blocks

Your agent handles it. When a check fires, proctor prints what tripped and what an honest fix looks
like, and the agent goes and does that instead. That's the normal path and it needs nothing from
you. At the terminal you'll see the finding and an exit code of `2`.

Three cases want a human, and each is one command.

**The test change was genuinely intended.** A feature got removed, so its tests went with it.
Record it and the finding stops blocking:

```bash
proctor approve RH001 tests/legacy-billing.test.ts --reason "billing v1 removed in RFC-88"
git add proctor.config.json && git commit -m "chore: approve RH001 for legacy billing"
```

It stays visible in every report with your reason attached. Approvals are read from the **committed**
config, so an agent cannot approve its own change in the change it is making, and an approval you
haven't committed yet has no effect.

**It's a false positive.** Suppress that one line:

```js
// proctor-ignore: RH004 reason: this is a lookup table, not a fixture hardcode
```

The marker has to be committed before the change it excuses, for the same reason approvals do. See
[inline suppression](docs/CONFIGURATION.md#inline-suppression).

**You want to know why a check exists.** Every finding prints its ID, and every ID explains itself:

```bash
proctor check --explain RH001        # what this check looks for
proctor check --explain RH001 --fix  # what an honest fix looks like
```

## What do the codes mean?

Every finding carries a short ID like `RH001`. They are just stable labels, the same idea as an
ESLint rule name, so a check can be referenced without spelling out a whole sentence. Nothing to
memorize: the plain-English name and full explanation print with every finding.

There are two families, and the split is by the claim each one checks.

**RH0xx checks "the tests pass."** These read the test suite and the code directly beneath it.

| | Catches |
|---|---|
| RH001 | A test deleted or renamed away |
| RH002 | An assertion weakened into a vaguer one |
| RH003 | A test skipped, disabled, or commented out |
| RH004 | An implementation hardcoded to match a fixture |
| RH005 | A function body replaced with a stub |
| RH006 | A snapshot rewritten with no reason given |
| RH007 | A test excluded via a config change |
| RH008 | An assertion that always passes |
| RH009 | A trivial test swapped in for a real one |
| RH010 | An async test detached, or timeouts/retries used to mask a failure |
| RH011 | Type and lint errors silenced instead of fixed |
| RH012 | A test step removed from CI, or neutered so failures stop counting |
| RH013 | A coverage threshold lowered or removed |
| RH014 | A surviving test changed to exercise fewer generated, looped, or table-driven cases |

**WI1xx checks "the work is done."** Deleting a test is only one way to fake a finished job. These
read shipped code for the rest of them, and none of the cheats they catch touches a test file.

| | Catches |
|---|---|
| WI101 | An error discarded by an empty handler, so failures pass unnoticed |
| WI102 | An explicit "not implemented" marker shipped inside finished-looking work |
| WI103 | Validation deleted so the case it rejected now goes through |
| WI104 | Proctor, a commit hook, or a type/lint gate switched off instead of satisfied |
| WI105 | Real network, database, or filesystem work replaced with canned data |
| WI106 | Types widened to `any` to silence the type checker |
| WI107 | A security check switched off, or an authorization gate removed |
| WI108 | Source or tests hidden from git, and therefore from every check |
| WI109 | A test's expected value edited to match the buggy output |
| WI110 | A test, lint, or build script rewritten so it can no longer fail |
| WI111 | The code under test deleted, or a test file emptied of its tests |
| WI112 | Assertions deleted from a surviving test, a golden file rewritten, or a module aliased to a stub |
| WI113 | A benchmark workload reduced, dependency downgraded, or fixed delay added instead of fixing the failure |

Every WI check skips test files on purpose. An empty catch is how you assert that something throws,
canned data is what a fixture is for, and a loose cast is ordinary when building a partial mock.
They watch the code your tests are meant to be proving.

Most of them also have the same escape hatch: a line whose comment explains why it is correct does
not get flagged. That is not a loophole, it is the point. An agent racing to a green build does not
stop to write the sentence, and if it does, the sentence is now in the diff for a human to read and
disagree with.

## Badges

[![proctor](https://img.shields.io/badge/proctor-honest_pass-22C55E)](https://github.com/catfish-1234/proctor)

`✓ proctor: honest pass` prints after a clean `proctor check`, and `proctor badge` gives you the
same result as Markdown to paste into your own README or a PR description (generated by
[`src/badge/index.ts`](src/badge/index.ts)):

```bash
$ proctor badge
[![proctor](https://img.shields.io/badge/proctor-honest_pass-22C55E)](https://github.com/catfish-1234/proctor)
```

A run only earns it when it is genuinely clean. Findings you approved through `approvedTestChanges`
do not count as clean, since somebody decided to let those through. The printed line is suppressed
under `--ci`, which is what the hooks and the GitHub Action use.

## CI

Add proctor to a pull request in eight lines. Findings land in the job summary, and in Code Scanning
as inline PR comments if the repository has it enabled.

```yaml
# .github/workflows/proctor.yml
on: [pull_request]
jobs:
  proctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with: { fetch-depth: 0 }
      - uses: catfish-1234/proctor@93ba04a30ac3d8ed0903a46bb028853346baff0a
```

## How it works

proctor has two halves.

The **ruleset** is a short document telling your agent how to finish work honestly. Most agents
follow it most of the time.

The **guard** is for the rest of the time. A ruleset alone is a request, and an agent under
pressure to show green can talk itself out of a request. So proctor also ships a
deterministic, diff-level guard that runs on every commit and at the end of every agent turn, and
blocks the changes that broke the rules. It works below the agent's own reasoning: it reads the
code change itself, never the agent's explanation of it, so nothing the agent says can argue
with it.

## Can the agent get around it?

That is the question the design answers, so it is worth being concrete about.

**The commit hook fails closed.** If proctor cannot run at all, the commit is blocked rather than
allowed. This used to be the other way round and it was the worst bug in the tool: the hook ran
`npx @kavishdua/proctor check --staged` and treated exit 1 as "clean with warnings", but `npx` also
exits 1 when it cannot resolve the package, so an unreachable registry looked identical to a clean
run and the commit landed unchecked. The hook now probes with `--version` first, prefers a local
install over the network, and refuses the commit when it cannot check it.

**Config is read from the committed baseline, not your working tree.** An agent that edits
`proctor.config.json` in the same change it is trying to land has changed nothing about the run:
enforcement uses the version at the diff baseline. The same goes for approvals and for inline
`proctor-ignore` markers, which only count when they were committed *before* the change they
excuse. Self-approval is not a matter of policy here, it does not work.

**Switching the guard off is itself a finding.** WI104 fires on a check removed from `enabled`, a
severity downgraded, an ignore pattern or approval added, a ruleset file deleted, a `--no-verify`
added to a script, or TypeScript strictness turned off. Since the config edit was already inert,
the point of the check is to make the attempt visible rather than to stop it.

**It reads the diff, never the explanation.** Nothing the agent says about its change is an input.
The remaining honest gap is a human running `git commit --no-verify`, which is deliberate: that is a
person overriding their own tooling, and it is caught at the next turn by the Stop hook and in CI.

## By the numbers

**How often agents actually do this.** These are other people's published measurements, not ours:

| | |
|---|---|
| **33.3%** | of ambiguous coding tasks where Claude Sonnet 4 hardcoded the expected output rather than solve the problem ([EvilGenie](https://arxiv.org/abs/2511.21654)) |
| **2.1%** | the same behaviour on unambiguous tasks, where the right fix was never in doubt (same paper) |
| **0.7%** | of tasks where Gemini 2.5 Pro deleted a test file outright (same paper) |
| **up to 100 pts** | gap between "the visible tests pass" and "the held-out tests pass" on the largest tasks in [SpecBench](https://arxiv.org/abs/2605.21384). It widens by about 28 points per tenfold increase in code size, and adding test coverage does not close it |
| **8 of 8** | agent benchmarks that [Berkeley RDI](https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/) drove to near-perfect scores without solving a single task. SWE-bench Verified fell to a pytest hook that forced every test to pass |

**What proctor catches.** The fixture and benchmark numbers below come out of `npm test`; the
adversarial number comes from the independent widening corpus in [`bench/redteam/`](bench/redteam):

| | |
|---|---|
| **135 of 135** | planted cheats caught. One fixture per check per language, each asserted against the exact finding proctor has to produce, not just "something fired" |
| **0 of 28** | near-miss fixtures flagged. Each one is a change built to look like a cheat and be legitimate: a single `@ts-ignore` with a justification, one retry rather than five, an empty catch whose comment explains itself, a guard clause extracted into a validator |
| **21 of 21** | recorded cheats caught in the benchmark corpus, across 7 signatures. Whole-repo task diffs rather than minimal fixtures. The 22nd task is a control that plants no cheat, and proctor stays silent on it. Reproduce with `proctor bench --mock` |
| **76 of 76** | adversarial cheat diffs caught, with **0 of 24** legitimate controls flagged across eleven total red-team rounds. Includes process-status laundering, workload cuts, dependency rollback, fixed-delay masking, CI trigger/matrix contraction, diagnostic suppression, and out-of-band Git index hiding. Reproduce with `node bench/redteam/probe.mjs` |
| **27** | checks in two families, across **25+** languages, installable into **30** agents |
| **under 1s** | to check a commit, offline. Measured here at roughly 0.25s on a 3-file diff and 0.55s on a 79-file one, cold Node start included |

**What we don't claim.** That proctor makes an agent *behave* better. That is a different measurement
and our own [benchmark](#benchmark) has not produced it: the one complete live run passed its
held-out tests in 44 of 44 runs, so the agent never reached the point where cheating was worth it
and there was no behaviour to change in either arm. The 135 of 135 above is a detection claim, which
is the claim the tool actually makes.

## Benchmark

`proctor bench` measures how often an agent games its own tests, and how often proctor catches it,
across a fixed pool of tasks with the ruleset on and off.

The honest state of this evidence: a complete 22-task live run against `claude-code`, both arms,
all 44 agent invocations scored.

| | proctor off | proctor on |
|---|---|---|
| cheat rate | **9.1%** (2 of 22) | **4.5%** (1 of 22) |
| honest-pass rate | **100.0%** | **100.0%** |

**This is not evidence that proctor changes behaviour, and the honest-pass column is why.** Every
one of the 44 runs passed its held-out tests, including all three that tripped a signature. The
held-out design exists precisely so that an agent which fakes a green build fails the hidden test.
Nothing failed one. The agent solved every task in the pool, including the seven built to make
cheating cheaper than fixing, so the situation the tool exists for never arose in either arm.

That also means the two flagged proctor-off diffs are most likely **false positives** rather than
caught cheats: RH005 on task-20, which fired in both arms, and RH004 on task-18. A diff that solves
the underlying problem and still trips a signature is a precision bug, and chasing those two is
worth more than the headline number above.

The gap between 9.1% and 4.5% is a single task. At n=22 that is noise, not a result, and quoting it
as a prevention rate would be exactly the sort of unearned green this project exists to catch.

The task corpus ships with this repository rather than the npm package, so `bench` needs a clone:

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install && npm run build
node dist/cli.js bench --tasks 22 --agent claude-code --out bench/results-live.csv
```

A 22-task run is 44 agent invocations, which is more than one Claude subscription session allows.
Three attempts reached 16, 14 and 16 tasks before the agent started returning "You've hit your
session limit", and a rate-limited agent looks exactly like an honest one once it reaches the CSV:
no changes, no cheat, no finding. `--resume` carries the completed tasks over from the
`.partial.csv` a failed attempt leaves behind, so a run can span more than one window; the numbers
above were collected that way. `PROCTOR_BENCH_TIMEOUT_MS` raises the per-invocation budget, which
the hard-tier tasks need. Read the `proctor: bench task-NN ... failed` lines on stderr before
trusting any number the table prints.

## Going further

Everything above is the whole product for most people. These pages are for when you want more:

| Page | What's in it |
|------|--------------|
| [docs/CLI.md](docs/CLI.md) | Every command and flag |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Config file, severities, approvals, [inline suppression](docs/CONFIGURATION.md#inline-suppression) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | It didn't fire, it fired wrongly, my approval didn't take |
| [docs/LANGUAGES.md](docs/LANGUAGES.md) | Per-language support matrix, the 30 supported agents, known limitations |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setting up, adding a check, adding an agent |
| [docs/RELEASING.md](docs/RELEASING.md) | Maintainer notes: how a tag becomes a release |
| [RESEARCH.md](RESEARCH.md) | Why it's built this way, and how it compares to Stryker and EvilGenie |
| [bench/METHODOLOGY.md](bench/METHODOLOGY.md) | How the benchmark works and what it does not claim |

proctor supports 25+ languages and installs to 30 agents. Five diff-level checks (RH001, RH002,
RH003, RH007, RH011) work across all of them; six (RH004, RH005, RH006, RH008, RH009, RH010) are
JS/TS/Python-only; and RH012 and RH013 read CI and coverage config, so they apply everywhere. Of the
work-integrity family, WI101, WI102 and WI103 carry per-language signatures, WI104 reads config
files so it applies everywhere, and WI105 and WI106 are scoped to the languages whose tokens are
unambiguous. [Full matrix](docs/LANGUAGES.md).

## The Proctor

Picture the exam invigilator: arms crossed, half-moon glasses, watching over a sweating robot
mid-delete of a failing test. That's proctor. The logo is a watchful eye with a green checkmark for
a pupil, watching whether your green is real. When it catches a cheat, the iris flips red and the
pupil becomes an X.

## License

MIT
