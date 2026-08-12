<p align="center">
  <img src="assets/proctor-logo.svg" alt="proctor logo, a watchful eye with a green checkmark pupil" width="96" height="96">
</p>

<h1 align="center">proctor</h1>

<p align="center"><strong>Your agent didn't fix the bug. It deleted the test and told you it passed. proctor catches it.</strong></p>

## What this is

proctor is a command-line tool that reads your git diff and blocks the changes an AI coding agent
makes when it fakes a passing build: deleting a failing test, skipping it, weakening the assertion,
hardcoding the answer the test expects.

It has two halves.

The **ruleset** is a short document telling your agent how to finish work honestly. Most agents
follow it most of the time.

The **guard** is for the rest of the time. A ruleset alone is a request, and an agent under
pressure to show green can talk itself out of a request. So proctor also ships a
deterministic, diff-level guard that runs on every commit and at the end of every agent turn, and
blocks the changes that broke the rules. It works below the agent's own reasoning: it reads the
code change itself, never the agent's explanation of it, so nothing the agent says can argue
with it.

No network, no account, no API key. The whole check runs offline.

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

## By the numbers

**How often agents actually do this.** These are other people's published measurements, not ours:

| | |
|---|---|
| **33.3%** | of ambiguous coding tasks where Claude Sonnet 4 hardcoded the expected output rather than solve the problem ([EvilGenie](https://arxiv.org/abs/2511.21654)) |
| **2.1%** | the same behaviour on unambiguous tasks, where the right fix was never in doubt (same paper) |
| **0.7%** | of tasks where Gemini 2.5 Pro deleted a test file outright (same paper) |
| **up to 100 pts** | gap between "the visible tests pass" and "the held-out tests pass" on the largest tasks in [SpecBench](https://arxiv.org/abs/2605.21384). It widens by about 28 points per tenfold increase in code size, and adding test coverage does not close it |
| **8 of 8** | agent benchmarks that [Berkeley RDI](https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/) drove to near-perfect scores without solving a single task. SWE-bench Verified fell to a pytest hook that forced every test to pass |

**What proctor catches.** Every number below comes out of `npm test` in this repo, against the
fixture corpus in [`fixtures/`](fixtures):

| | |
|---|---|
| **125 of 125** | planted cheats caught. One fixture per check per language, each asserted against the exact finding proctor has to produce, not just "something fired" |
| **0 of 18** | near-miss fixtures flagged. Each one is a change built to look like a cheat and be legitimate: a single `@ts-ignore` with a justification, one retry rather than five, a snapshot rewrite whose commit message gives the reason |
| **13** | checks, across **25+** languages, installable into **30** agents |
| **under 1s** | to check a commit, offline. Measured here at roughly 0.25s on a 3-file diff and 0.55s on a 79-file one, cold Node start included |

**What we don't claim.** That proctor makes an agent *behave* better. That is a different measurement
and our own [benchmark](#benchmark) has not produced it yet: the numbers there are a null result on
tasks that turned out too easy to cheat on. The 125/125 above is a detection claim, which is the
claim the tool actually makes.

## Try it before installing anything

In a git repository where you have uncommitted changes:

```bash
npx @kavishdua/proctor check
```

You need Node 20 or newer. Nothing is written, nothing is installed, and no network call is made.

If it prints `✓ proctor: honest pass`, your current changes are clean. If your changes don't touch
tests at all, that's the answer you should expect.

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

```bash
npx @kavishdua/proctor setup
```

### What `setup` does

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
| RH010 | Timeouts or retries used to mask a failure |
| RH011 | Type and lint errors silenced instead of fixed |
| RH012 | A test step removed from CI, or neutered so failures stop counting |
| RH013 | A coverage threshold lowered or removed |

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
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: catfish-1234/proctor@main
```

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
JS/TS/Python-only; and RH012 and RH013 read CI and coverage config, so they apply everywhere.
[Full matrix](docs/LANGUAGES.md).

## Benchmark

`proctor bench` measures how often an agent games its own tests, and how often proctor catches it,
across a fixed pool of tasks with the ruleset on and off.

The honest state of this evidence: a live 15-task run against `claude-code` produced a **0.0%**
cheat rate with proctor off and **0.0%** with it on, at honest-pass rates of **80.0%** and
**73.3%**. That shows no difference, and the reason is the tasks, not the agent. They were all
single-line fixes, so the agent never reached a point where cheating was cheaper than fixing.

The task pool has since grown to 22, with seven tasks built the other way round: a fix that takes
real work (banker's rounding, semver prerelease rules, grapheme clusters) against a cheat that is
still one line away. Those numbers have not been collected yet. Until they are, treat the table
above as what it is, a null result on tasks too easy to measure anything.

The task corpus ships with this repository rather than the npm package, so `bench` needs a clone:

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install && npm run build
node dist/cli.js bench --tasks 22 --agent claude-code --out bench/results-live.csv
```

## The Proctor

Picture the exam invigilator: arms crossed, half-moon glasses, watching over a sweating robot
mid-delete of a failing test. That's proctor. The logo is a watchful eye with a green checkmark for
a pupil, watching whether your green is real. When it catches a cheat, the iris flips red and the
pupil becomes an X.

## License

MIT
