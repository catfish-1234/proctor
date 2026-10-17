<p align="center">
  <img src="https://raw.githubusercontent.com/catfish-1234/proctor/main/assets/proctor-logo.svg" alt="proctor logo, a watchful eye with a green checkmark pupil" width="96" height="96">
</p>

<h1 align="center">proctor</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@kavishdua/proctor"><img src="https://img.shields.io/npm/v/@kavishdua/proctor?color=2ea043&label=npm" alt="npm version"></a>
  <a href="https://github.com/catfish-1234/proctor/actions/workflows/ci.yml"><img src="https://github.com/catfish-1234/proctor/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://github.com/catfish-1234/proctor/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@kavishdua/proctor?color=blue" alt="MIT license"></a>
</p>

<p align="center"><strong>Catch test tampering in AI coding agents' changes.</strong></p>

proctor checks your git diff for deleted tests, weakened assertions, hardcoded answers,
swallowed errors, and disabled checks. Its hooks block changes that trigger an error finding.

The default check runs offline: no account or API key. The optional `--ai` judge sends candidates
to Anthropic and needs `ANTHROPIC_API_KEY`. You need Node 20 or newer; building and testing from
source needs Node 20.19+ or 22.12+.

## Contents

**Getting started**

- [Quickstart](#quickstart), try it from source against a repo
- [Install](#install), and exactly what it writes
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

The `✓ proctor: honest pass` line means there are no error-level or approved findings. Warnings
may still be reported. Checks cover source and configuration changes as well as tests.

The check writes nothing to the repository being checked and makes no runtime network call.
`npm ci` installs dependencies in the proctor checkout.

## Install

Agent plugins install the ruleset. For CLI checks and hooks, use the local npm installation below.

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

**Other agents, or CLI use without an agent** (30 agents supported)

Until the npm package is published, build its installable tarball from source:

```bash
# In the proctor checkout
npm ci
npm run build
npm pack

# In the repository proctor should guard; use the .tgz path printed above
npm install --save-dev /absolute/path/to/kavishdua-proctor-*.tgz
```

**Proctor does not install guards during npm installation by default.** npm still updates your
package files and `node_modules`. Proctor prints what setup would write, then stops. From the
repository you want to guard, run:

```bash
npx proctor setup
```

### What that setup does

This is what `proctor setup` writes. It makes no network call. Git chooses the hook directory,
which may be outside the working tree when you use worktrees or `core.hooksPath`.

| Path | What it is | If it already exists |
| --- | --- | --- |
| The ruleset file for each agent this repo uses, e.g. `.claude/skills/proctor/SKILL.md`, `.cursor/rules/proctor.mdc`, `AGENTS.md` | The honest-completion rules your agent reads before it works | A shared file like `AGENTS.md` keeps your content; only proctor's delimited block is replaced |
| Git's hook directory (`.git/hooks/pre-commit` normally), or `.husky/pre-commit` when Husky is a dev dependency | Blocks a cheat at commit time; the Husky file is also staged | A foreign hook is backed up to `pre-commit.bak`, then replaced; merge it manually if needed |
| `.claude/settings.json` | The Claude Code Stop hook, written only if this repo uses Claude Code | Merged into the existing JSON; nothing else in the file changes |
| `.proctor-adapter-manifest.json` | Records what was written, so `uninstall` can take exactly that back out | Rewritten |

proctor detects agents from their config files, such as `.cursor/`, `.claude/`, or `WARP.md`,
and installs the ruleset for those agents. If it finds none, it writes `AGENTS.md`.
Run `proctor agents` to check the list before installing. Use `--all` for all 30 supported agents,
or `--agents claude-code,cursor` to choose them yourself.

The npm postinstall notice and automatic setup stay quiet in CI, global installs, transitive
installs, outside a git repository, and under `npx`. An explicit `proctor setup` still runs.

Set `PROCTOR_AUTO_SETUP=1` to run `proctor setup` automatically during installation.
Set `PROCTOR_NO_POSTINSTALL=1` to silence the install-time notice.

### One thing to do afterwards

**Commit what it wrote.** The ruleset files and `.proctor-adapter-manifest.json` are ordinary files
in your repo, and they only reach your teammates and your CI once they're committed.

```bash
git add -A && git commit -m "chore: add proctor"
```

If you use Claude Code, restart it so it picks up the new Stop hook.

The hooks run checks automatically. A config file is optional.

### Checking it worked

```bash
npx proctor drift-check   # exits 0 if every deployed ruleset copy still matches the source
npx proctor statusline    # "proctor: watching", or "proctor: 3 caught" once it has blocked something
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

An agent deleted the test and told you it passed. It had been asked to make `slugify()` return
`''` for whitespace-only input; instead, it removed that test:

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

With the pre-commit hook installed, this finding blocks the commit until the test is restored
or the change is approved.

The recording shows the CLI detecting a deleted test, followed by the Claude Code Stop hook
blocking the same change during an agent session.

![proctor demo](https://raw.githubusercontent.com/catfish-1234/proctor/main/assets/demo.gif)

## What happens when it blocks

When a check fires, proctor prints the finding and suggested fix. Error findings exit `2` and
block the commit or agent turn. Review the suggestion, then fix the change or record an exception.

**The test change was intended.** For example, you removed a feature and its tests.
Record the reason to make the finding non-blocking:

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
[inline suppression](https://github.com/catfish-1234/proctor/blob/main/docs/CONFIGURATION.md#inline-suppression).

**You want to know why a check exists.** Every finding prints its ID, and every ID explains itself:

```bash
proctor check --explain RH001        # what this check looks for
proctor check --explain RH001 --fix  # what an honest fix looks like
```

## What do the codes mean?

For `proctor check`, exit `0` means no warning or error findings, `1` means warnings only, `2` means
error findings, and `3` means the check could not complete (for example, outside a git repository).
With `--ci`, warnings still appear in JSON, SARIF, and Markdown but exit `0`; text output shows
only errors. Invalid arguments can also exit `1` or `2`, and `--ai` without its key exits `1`.

Use `npx proctor check --staged` for the index or `npx proctor check --base origin/main` for
committed changes since the merge base. The default includes staged, unstaged, and untracked files.
Run `npx proctor check --help` for flags, or see the
[CLI reference](https://github.com/catfish-1234/proctor/blob/main/docs/CLI.md).

Every finding has a stable ID such as `RH001`, used in config, approvals, and reports. Use
`proctor check --explain <id>` for the description and fix guidance. The checks fall into two
families.

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

**WI1xx checks "the work is done."** These look for incomplete or disabled behavior in source,
config, and tests, including discarded errors, removed validation, and altered expected values.

> **Beta, and opt-in for now.** The WI family is off by default in v1.0.0. Turn it on for one run
> with `proctor check --wi` (or `--all-checks`), or for good by listing the IDs you want in
> `enabled` in `proctor.config.json`, which also applies them in both hooks. These thirteen checks
> cover 25+ languages and have had less real-world testing than the RH family, so they remain
> opt-in while we assess false positives.

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

Several WI checks skip test files because mocks, loose casts, and empty handlers can be normal
in tests. Others, including WI109, WI111, and WI112, inspect changes to tests themselves.
See the language matrix for each check's scope.

Some WI checks accept an explanatory comment; others require a committed approval or suppression
marker. Check the rule's `--explain` output before relying on an exception.

## Badges

[![proctor](https://img.shields.io/badge/proctor-honest_pass-22C55E)](https://github.com/catfish-1234/proctor)

`✓ proctor: honest pass` prints after a clean `proctor check`, and `proctor badge` gives you the
same result as Markdown to paste into your own README or a PR description (generated by
[`src/badge/index.ts`](https://github.com/catfish-1234/proctor/blob/main/src/badge/index.ts)):

```bash
$ proctor badge
[![proctor](https://img.shields.io/badge/proctor-honest_pass-22C55E)](https://github.com/catfish-1234/proctor)
```

Findings approved through `approvedTestChanges` do not count as clean and do not earn the badge.
`--ci` suppresses the printed badge line; the GitHub Action and Stop hook use this flag.

## CI

Add proctor to a pull request with this workflow. Findings land in the job summary and in Code
Scanning if the repository has it enabled.

```yaml
# .github/workflows/proctor.yml
on: [pull_request]
permissions:
  contents: read
  security-events: write
jobs:
  proctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with: { fetch-depth: 0 }
      - uses: catfish-1234/proctor@1bfd0b192ea214a0ed349b27822b11b8ccf23e07
```

No release tags exist yet, so the example pins an existing source commit. After the first release,
`catfish-1234/proctor@v1` will be the moving tag for the newest `1.x` release. To keep builds
reproducible, use a full commit SHA as above; a full SHA is immutable.

## How it works

proctor combines a **ruleset** with a **guard**. The ruleset tells the agent how to complete work
and report results. The deterministic, diff-level guard checks for known tampering patterns at
commit time and, with the Claude Code Stop hook, at the end of a turn. It works
below the agent's own reasoning by checking the changed code rather than the agent's explanation.

## Can the agent get around it?

**The commit hook fails closed.** It probes with `--version`, prefers a local install, and blocks
when proctor cannot run. An older hook treated exit `1` from `npx` as a warning-only result, even
when the package could not be resolved. The probe prevents that failure from allowing an
unchecked commit.

**Config comes from the committed baseline.** Editing `proctor.config.json` does not change how
that same diff is checked. Approvals and inline `proctor-ignore` markers must also be committed
before the change they cover.

**Switching the guard off is itself a finding.** WI104 fires on a check removed from `enabled`, a
severity downgraded, an ignore pattern or approval added, a ruleset file deleted, a `--no-verify`
added to a script, or TypeScript strictness turned off. WI104 is part of the opt-in WI family.

**Local hooks can be bypassed.** Anyone with shell access can run `git commit --no-verify`.
A base-range CI check can still inspect the committed change. The Stop hook checks uncommitted
changes and allows turns when proctor cannot run, so it is not a substitute for CI.

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
adversarial number comes from the independent widening corpus in [`bench/redteam/`](https://github.com/catfish-1234/proctor/tree/main/bench/redteam):

| | |
|---|---|
| **139 of 139** | planted cheats caught. One fixture per check per language, each asserted against the exact finding proctor has to produce, not just "something fired" |
| **0 of 33** | near-miss fixtures flagged. Each one is a change built to look like a cheat and be legitimate: a single `@ts-ignore` with a justification, one retry rather than five, an empty catch whose comment explains itself, a guard clause extracted into a validator |
| **21 of 21** | recorded cheats caught in the benchmark corpus, across 7 signatures. Whole-repo task diffs rather than minimal fixtures. The 22nd task is a control that plants no cheat, and proctor stays silent on it. Reproduce with `proctor bench --mock` |
| **76 of 76** | adversarial cheat diffs caught with **both families enabled**, and **0 of 24** legitimate controls flagged, across eleven total red-team rounds. The corpus probes the WI family too, so reproduce it with `--all-checks`; the RH family alone catches 25 of the 76, since the rest are cheats the WI checks were written for. Includes process-status laundering, workload cuts, dependency rollback, fixed-delay masking, CI trigger/matrix contraction, diagnostic suppression, and out-of-band Git index hiding. Reproduce with `node bench/redteam/probe.mjs` |
| **3.8%** | of 689 real human commits, sampled from 20 maintained open-source repositories across seven languages, produce any finding at all from the default check set. **2.32%** produce a blocking one, and most of those are the check correctly noticing that somebody deleted a test or added a skip marker |
| **27** | checks in two families, across **25+** languages, installable into **30** agents |
| **under 1s** | to check a commit, offline. Measured here at roughly 0.25s on a 3-file diff and 0.55s on a 79-file one, cold Node start included |

**What we don't claim.** The 139 of 139 result measures detection of planted changes.
Our [benchmark](#benchmark) has not shown that proctor reduces cheating: all 44 invocations in
each of the two complete live runs passed their held-out tests in both arms.

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

## Going further

For command details, configuration, support limits, and contributor instructions:

| Page | What's in it |
|------|--------------|
| [docs/CLI.md](https://github.com/catfish-1234/proctor/blob/main/docs/CLI.md) | Every command and flag |
| [docs/CONFIGURATION.md](https://github.com/catfish-1234/proctor/blob/main/docs/CONFIGURATION.md) | Config file, severities, approvals, [inline suppression](https://github.com/catfish-1234/proctor/blob/main/docs/CONFIGURATION.md#inline-suppression) |
| [docs/TROUBLESHOOTING.md](https://github.com/catfish-1234/proctor/blob/main/docs/TROUBLESHOOTING.md) | It didn't fire, it fired wrongly, my approval didn't take |
| [docs/LANGUAGES.md](https://github.com/catfish-1234/proctor/blob/main/docs/LANGUAGES.md) | Per-language support matrix, the 30 supported agents, known limitations |
| [CONTRIBUTING.md](https://github.com/catfish-1234/proctor/blob/main/CONTRIBUTING.md) | Setting up, adding a check, adding an agent |
| [docs/RELEASING.md](https://github.com/catfish-1234/proctor/blob/main/docs/RELEASING.md) | Maintainer notes: how a tag becomes a release |
| [RESEARCH.md](https://github.com/catfish-1234/proctor/blob/main/RESEARCH.md) | Why it's built this way, and how it compares to Stryker and EvilGenie |
| [bench/METHODOLOGY.md](https://github.com/catfish-1234/proctor/blob/main/bench/METHODOLOGY.md) | How the benchmark works and what it does not claim |

proctor supports 25+ languages and installs to 30 agents. Five diff-level checks (RH001, RH002,
RH003, RH007, RH011) work across all of them; six (RH004, RH005, RH006, RH008, RH009, RH010) are
JS/TS/Python-only; and RH012 and RH013 read CI and coverage config, so they apply everywhere. Of the
work-integrity family, WI101, WI102 and WI103 carry per-language signatures, WI104 reads config
files so it applies everywhere, and WI105 and WI106 are scoped to the languages whose tokens are
unambiguous. [Full matrix](https://github.com/catfish-1234/proctor/blob/main/docs/LANGUAGES.md).

## The Proctor

The name comes from an exam invigilator. The logo is an eye with a green checkmark for a pupil.
When proctor catches a problem, the iris turns red and the pupil becomes an X.

## License

MIT
