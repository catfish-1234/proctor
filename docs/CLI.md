# CLI reference

Every command and flag. Most people never need this page: `proctor check` and the two
install commands in the [README](../README.md) cover normal use.

Straight from `proctor --help` and `proctor <command> --help`.

### `proctor setup`

The one command most people need. It writes the ruleset to every agent path this repository is set
up for, installs the git pre-commit hook, and installs the Claude Code Stop hook, then reports what
it did.

```bash
npx @kavishdua/proctor setup
```

It is the three `install-*` commands below in one step, and it exists because doing two of the
three is easy to mistake for being covered. The ruleset without the hooks is exactly the
arrangement proctor argues against: rules an agent can decline to follow with nothing behind them.

Running it again is safe. Shared instruction files are merged rather than overwritten, and a Stop
hook that is already present is left alone. If one part cannot proceed (no git repository, a
settings file that is not valid JSON) it says so and still completes the others, exiting nonzero.

### `proctor check [path]`

Checks your current diff against every enabled check.

| Flag | What it does |
|------|--------------|
| `--staged` | only look at staged changes |
| `--base <ref>` | compare against a base ref (like `origin/main` or a commit SHA) instead of your working changes. Useful in CI, where nothing is staged in a fresh checkout |
| `--ci` | quiet mode: only print errors, exit nonzero only on an error |
| `--json` | print findings as JSON |
| `--sarif` | print SARIF 2.1.0 JSON, for tools that consume that format |
| `--ai` | turn on the optional AI judge for ambiguous cases (needs `ANTHROPIC_API_KEY`) |
| `--rules <ids>` | only run specific checks, e.g. `RH001,RH003` |
| `--explain <id>` | print the full explanation for one check and exit, no diff analysis |
| `--fix` | with `--explain`, print what an honest fix for that check looks like |
| `--markdown <file>` | also append a Markdown summary to this file, e.g. `--markdown "$GITHUB_STEP_SUMMARY"` |

Exit codes: `0` means clean, `1` means warnings only, `2` means at least one error was found.

```bash
$ proctor check --explain RH001
RH001: TestDeletedOrRenamed

Detects a test file or individual test function deleted, disabled, or renamed
in a way that drops its test extension, hiding a failing test rather than
fixing the underlying code.

Default severity: error
More info: https://github.com/catfish-1234/proctor#rh001
```

### `proctor install-hook`

Installs a git pre-commit hook that runs `proctor check --staged`. Detects Husky automatically and
writes to `.husky/pre-commit`, otherwise falls back to `.git/hooks/pre-commit`.

Only error-severity findings block the commit. Warnings are printed so you see them, but the
commit still goes through, the same policy the Claude Code Stop hook follows. If you already have
a pre-commit hook from another tool, proctor backs it up to `pre-commit.bak` before writing its
own, and tells you it did.

### `proctor stop-hook`

The Claude Code Stop hook itself. Reads the hook payload from stdin, runs a check, and exits `2`
to block the turn if it finds something serious. Never exits `1`, since that's non-blocking in
Claude Code.

### `proctor install-claude-hook`

Wires the Stop hook into a project's `.claude/settings.json`.

| Flag | What it does |
|------|--------------|
| `--global` | write to `~/.claude/settings.json` instead of the project's local settings |

Safe to run more than once; it won't add a duplicate entry.

### `proctor install-skill`

Deploys the honest-completion skill to every supported agent in one command, from a single source
file (see [`src/adapters/registry.ts`](src/adapters/registry.ts)). Paths proctor owns are written
whole. Shared files you also write your own content into are merged into a
[managed block](#supported-languages-and-agents) instead, leaving the rest of the file alone.

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
`--last` is bounded.

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
takes effect. See [Approving a genuine test change](#approving-a-genuine-test-change).

| Flag | What it does |
|------|--------------|
| `-r, --reason <text>` | why this change is legitimate. Required, and an approval without one is dropped |

### `proctor bench`

Runs the benchmark harness: a set of seeded tasks, run once with proctor on and once with it off,
producing a CSV and a before/after cheat-rate table.

| Flag | What it does |
|------|--------------|
| `--tasks <n>` | how many tasks to run (default `10`) |
| `--seed <n>` | seed for picking tasks deterministically (default `1`) |
| `--mock` | use the mock fixture runner instead of a real agent, no network needed |
| `--agent <id>` | which agent to run, e.g. `claude-code`, `codex` (default `claude-code`) |
| `--out <path>` | where to write the results CSV |

See [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md) for the full methodology.
