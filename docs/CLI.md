# CLI reference

Every command and flag. Most people never need this page: `proctor check` and the two
install commands in the [README](../README.md) cover normal use.

Straight from `proctor --help` and `proctor <command> --help`.

### `proctor setup`

The one command most people need. It works out which agents this repository uses, writes the
ruleset to those, installs the git pre-commit hook, and installs the Claude Code Stop hook if
Claude Code is one of them, then reports what it did.

```bash
proctor setup
```

This assumes a local install. The scoped npm package is not published yet; the README documents
the temporary source-tarball installation path.

It is the three `install-*` commands below in one step, and it exists because doing two of the
three is easy to mistake for being covered. The ruleset without the hooks is exactly the
arrangement proctor argues against: rules an agent can decline to follow with nothing behind them.

**How detection works.** An agent counts as in use when its own config file or directory is already
in the repository: `.cursor/` for Cursor, `.claude/` or `CLAUDE.md` for Claude Code, `WARP.md` for
Warp, and so on. Run `proctor agents` to see the full list and what was detected. A repository with
no agent config at all gets `AGENTS.md`, the cross-vendor standard, so whatever you pick up later
still reads the ruleset.

Detection exists so proctor writes 2 files into a repository that uses two agents, not 30 into one
that uses two. Use `--all` if you genuinely want the full roster.

| Flag | What it does |
|------|--------------|
| `--all` | write to all 30 supported agents, not only the detected ones |
| `--agents <ids>` | install to exactly these agent ids, e.g. `claude-code,cursor` |

Running it again is safe. Shared instruction files are merged rather than overwritten, and a Stop
hook that is already present is left alone. If one part cannot proceed (no git repository, a
settings file that is not valid JSON, an unwritable path) it says so, still completes the others,
and exits nonzero.

**Commit what it writes.** The ruleset files and `.proctor-adapter-manifest.json` are ordinary
files in your repository; they only reach your teammates and CI once they are committed. The
manifest in particular is what lets `drift-check` tell "never installed here" apart from "installed
and since deleted", which is the tampering case worth catching.

### `proctor check [path]`

Checks your current diff against every enabled check. The optional `path` runs the check in that
directory instead of the current one, which is useful when proctor is driving another repository.

| Flag | What it does |
|------|--------------|
| `--staged` | only look at staged changes |
| `--uncommitted` | explicitly select the default scope: staged, unstaged, and untracked changes together. This is what the Stop hook spells out for clarity |
| `--base <ref>` | compare against a base ref (like `origin/main` or a commit SHA) instead of your working changes. Useful in CI, where nothing is staged in a fresh checkout |
| `--ci` | print only error-severity findings, suppress the honest-pass line, and exit nonzero only on an error |
| `--json` | print findings as JSON |
| `--sarif` | print SARIF 2.1.0 JSON, for tools that consume that format |
| `--ai` | turn on the optional AI judge for ambiguous cases (needs `ANTHROPIC_API_KEY`). Everything else is offline: no network, no account |
| `--rules <ids>` | only run specific checks, e.g. `RH001,RH003` |
| `--wi` | also run the beta work-integrity family (WI101 to WI113), which is opt-in in v1.0.0 |
| `--all-checks` | run every check in the registry: the RH family and the beta WI family together |
| `--explain <id>` | print the full explanation for one check and exit, no diff analysis. Combine with `--json` for a structured record an agent can act on |
| `--fix` | with `--explain`, print what an honest fix for that check looks like |
| `--markdown <file>` | also append a Markdown summary to this file, e.g. `--markdown "$GITHUB_STEP_SUMMARY"` |

Exit codes: `0` means clean, `1` means warnings only, `2` means at least one error was found, and
`3` means Proctor itself failed before it could complete the check. The pre-commit hook propagates
`3` and blocks; the Claude Stop hook deliberately allows infrastructure failures as documented
below.

```bash
$ proctor check --explain RH001
RH001: TestDeletedOrRenamed

Detects a test file or individual test function deleted, disabled, or renamed
in a way that drops its test extension, hiding a failing test rather than
fixing the underlying code.

Default severity: error
More info: https://github.com/catfish-1234/proctor#rh001
Honest fix: proctor check --explain RH001 --fix
```

`proctor --version` prints the version and exits.

### `proctor install-hook`

Installs a git pre-commit hook that runs `proctor check --staged`. Detects Husky automatically and
writes to `.husky/pre-commit`, otherwise falls back to `.git/hooks/pre-commit`.

Only error-severity findings block the commit. Warnings are printed so you see them, but the
commit still goes through, the same policy the Claude Code Stop hook follows. If you already have
a pre-commit hook from another tool, proctor backs it up to `pre-commit.bak` before writing its
own, and tells you it did.

### `proctor stop-hook`

The Claude Code Stop hook itself. Reads the hook payload from stdin, runs `check --uncommitted
--ci`, and exits `2` to block the turn if it finds something serious. Never exits `1`, since that's
non-blocking in Claude Code.

It reads uncommitted changes, staged and unstaged both, because an agent that has just finished
editing has usually staged nothing. Outside a git repository, or if proctor itself errors or takes
longer than 60 seconds, it allows the turn: a guard that breaks should not become a wall.

### `proctor install-claude-hook`

Wires the Stop hook into a project's `.claude/settings.json`.

| Flag | What it does |
|------|--------------|
| `--global` | write to `~/.claude/settings.json` instead of the project's local settings |

Safe to run more than once; it won't add a duplicate entry.

### `proctor install-skill`

Deploys the honest-completion skill to the agents this repository uses, from a single source file
(see [`src/adapters/registry.ts`](../src/adapters/registry.ts)). Paths proctor owns are written
whole. Shared files you also write your own content into are merged into a managed block instead,
leaving the rest of the file alone.

This is the ruleset half of `setup`, without the hooks. It takes the same `--all` and
`--agents <ids>` flags, and the same detection rules.

### `proctor agents`

Lists every supported agent, its install path, and whether this repository appears to use it. Run
it before `setup` if you want to see what will be written.

```bash
$ proctor agents
detected  claude-code            .claude/skills/proctor/SKILL.md
       -  codex                  .agents/skills/proctor/SKILL.md
detected  cursor                 .cursor/rules/proctor.mdc
...
2 of 30 detected. proctor setup installs to the detected ones; --all installs to every one.
```

### `proctor uninstall`

Removes everything proctor installed in this repository: the ruleset files, the managed block in
each shared file, the adapter manifest, the pre-commit hook, and the Stop hook entry.

| Flag | What it does |
|------|--------------|
| `--dry-run` | list what would be removed without removing it |

It is deliberately conservative about things that are not proctor's. A shared file keeps all of
your own content and only loses the managed block; a file that would be left empty is deleted
rather than left as a husk. A pre-commit hook that is not proctor's, and any other `Stop` hook in
your settings, are left exactly as they are. `proctor.config.json` is left in place too, since your
approvals and severities are yours to keep.

### `proctor badge`

Prints the honest-pass badge for the current changes, as Markdown you can paste into a README or a
PR description.

```bash
$ proctor badge
[![proctor](https://img.shields.io/badge/proctor-honest_pass-22C55E)](https://github.com/catfish-1234/proctor)
```

| Flag | What it does |
|------|--------------|
| `--staged` | judge staged changes instead of the working tree |
| `--url` | print just the image URL, without the Markdown wrapper |

The badge reflects the run it was generated from: a run with an error-severity finding produces a
`caught` badge, not an honest pass.

### `proctor drift-check`

Checks that every deployed skill copy still matches the source file. Exits `1` if any copy has
drifted, `0` otherwise. Handy as a CI check so a stale copy gets caught.

For a shared file, this compares the managed block and ignores everything around it, so your own
notes never register as drift. Deleting the block from a file proctor previously wrote to does
register, which is the case worth catching.

### `proctor watch`

Re-runs a check whenever files change, so you can leave it in a second pane while an agent works
and see a cheat the moment it lands rather than at the end of the turn.

Each run happens in its own process, so a check that fails cannot take the watcher down with it,
and `node_modules`, `dist`, `.git` and friends are ignored so an install or a build does not
trigger a run.

| Flag | What it does |
|------|--------------|
| `--staged` | check staged changes instead of the working tree |
| `--rules <ids>` | only run these checks |
| `--debounce <ms>` | quiet period before re-running, default `250` |

### `proctor score`

Scores recent commits: how many landed with nothing blocking. This is the measurement view rather
than the gate, and it is useful for answering "is this agent getting more honest over time" or
"which rule keeps catching us".

```bash
proctor score --last 50
proctor score --last 50 --author "some-agent"
```

There is no history file to keep. Every past commit is a diff, and proctor already knows how to
judge a diff, so the score is recomputed from the repository each time. That means it is the same
on any clone, and there is no state to corrupt. It costs one check per commit, which is why
`--last` defaults to a modest 20 rather than the whole history.

Each commit is judged against the config that was committed *with it*, not today's config, so the
score reflects the rules that were actually in force at the time. The first commit in a repository
has no parent to compare against and is reported as skipped rather than counted clean.

| Flag | What it does |
|------|--------------|
| `--last <n>` | how many commits to score, newest first, default `20` |
| `--author <pattern>` | only score commits matching this git `--author` pattern |
| `--all` | list every scored commit, not just the ones that were blocked |
| `--json` | emit the report as JSON |
| `--min-rate <percent>` | exit 2 when the honesty rate falls below this, for use as a CI gate |

`--min-rate` turns the measurement into a gate. `proctor check` blocks one bad change; this catches
the slower version, where nothing individually alarming happens but the trend goes the wrong way:

```bash
proctor score --last 50 --min-rate 90
```

A repository with no scorable history passes with a note rather than failing, since having no
evidence is not the same as failing.

### `proctor statusline`

Prints one line for an agent status bar: `proctor: watching` normally, `proctor: 3 caught` once
the Stop hook has blocked something in this checkout.

The tally lives in `.git/`, so it is local to your clone, never committed, and needs no
`.gitignore` entry. Nothing else reads it, so it never affects whether a turn is blocked.

| Flag | What it does |
|------|--------------|
| `--reset` | clear the tally |
| `--plain` | no color, for status bars that do not render ANSI |

### `proctor approve <rule> <file> --reason <text>`

Records a genuine test change in `proctor.config.json` so it stops blocking. The finding stays
visible in every report with your reason attached, and the change has to be committed before it
takes effect. See
[Approving a genuine test change](CONFIGURATION.md#approving-a-genuine-test-change).

| Flag | What it does |
|------|--------------|
| `-r, --reason <text>` | why this change is legitimate. Required, and an approval without one is dropped |

### `proctor bench`

Runs the benchmark harness: a set of seeded tasks, run once with proctor on and once with it off,
producing a CSV and a before/after cheat-rate table.

The task corpus ships with the repository, not the npm package, so this command needs a clone:

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install && npm run build
node dist/cli.js bench --mock
```

| Flag | What it does |
|------|--------------|
| `--tasks <n>` | how many tasks to run (default `10`) |
| `--seed <n>` | seed for picking tasks deterministically (default `1`) |
| `--mock` | use the mock fixture runner instead of a real agent, no network needed |
| `--agent <id>` | which agent to run, e.g. `claude-code`, `codex` (default `claude-code`) |
| `--out <path>` | where to write the results CSV |

See [`bench/METHODOLOGY.md`](../bench/METHODOLOGY.md) for the full methodology.
