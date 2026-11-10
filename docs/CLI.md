# CLI reference

Command and flag reference. Start with the [README](../README.md) for installation.
You can also run `proctor --help` or `proctor <command> --help`.

### `proctor setup`

Detects the agents in this repository, writes their rulesets, and installs the git pre-commit
hook. If Claude Code or Codex CLI is among the selected agents, it also installs that agent's
Stop hook in `.claude/settings.json` or `.codex/hooks.json`, respectively. For Gemini CLI
(experimental: contract-verified only, consumer auth retired by Google), it installs an
AfterAgent hook in `.gemini/settings.json` only when explicitly selected with
`--agents gemini-cli` or `--all`, never on detection alone.

```bash
proctor setup
```

This assumes a local install: `npm install --save-dev @kavishdua/proctor`.

This combines ruleset deployment with git and supported agent hook installation. The ruleset
provides instructions; the hooks enforce the checks.

Codex requires both project trust (the interactive prompt, or `trust_level = "trusted"` under
`[projects."/absolute/path/to/repo"]` in `~/.codex/config.toml`) and review of new or changed
hooks (the prompt or `/hooks` in the CLI). Project-local hooks are silently ignored until the
project is trusted, and require hook approval before they run.

Gemini CLI support is experimental and opt-in (contract-verified only; consumer Gemini CLI auth
is retired by Google, and Antigravity CLI is the supported successor). Gemini CLI hooks are
enabled by default since v0.26.0. Gemini fingerprints project hooks and
warns before running new or changed hooks. Review the one-time trust prompt and manage hooks
with the `/hooks` panel command.

**How detection works.** An agent counts as in use when its own config file or directory is already
in the repository: `.cursor/` for Cursor, `.claude/` or `CLAUDE.md` for Claude Code, `WARP.md` for
Warp, `.gemini/` or `GEMINI.md` for Gemini CLI, and so on. Run `proctor agents` to see the full
list and what was detected. A repository with no agent config at all gets `AGENTS.md`, the
cross-vendor standard, so whatever you pick up later still reads the ruleset.

By default, setup writes rulesets only for detected agents. Use `--all` for the full roster.

| Flag | What it does |
|------|--------------|
| `--all` | write to all 30 supported agents, not only the detected ones |
| `--agents <ids>` | install to exactly these agent ids, e.g. `claude-code,cursor` |

Running it again is safe. Shared instruction files are merged rather than overwritten, and an agent
hook that is already present is left alone. If one part cannot proceed (no git repository, a
settings file that is not valid JSON, an unwritable path) it says so, still completes the others,
and exits nonzero.

**Commit what it writes.** The ruleset files and `.proctor-adapter-manifest.json` are ordinary
files in your repository; they only reach your teammates and CI once they are committed. The
manifest lets `drift-check` report a deleted ruleset even when its shared file still exists.

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
| `--rules <ids>` | narrow the enabled checks, e.g. `RH001,RH003`; use `--wi` to enable WI checks first |
| `--dynamic` | run isolated project tests for additional runtime evidence; requires Linux and bubblewrap, otherwise reports a skip |
| `--dynamic-timeout <ms>` | override the overall dynamic budget in milliseconds (default 60000, also `dynamicTimeoutMs` in committed config) |
| `--wi` | add the entire work-integrity family (WI101 to WI113), including the seven checks that remain opt-in |
| `--all-checks` | alias for `--wi`: add the beta WI family to the configured checks |
| `--explain <id>` | print the full explanation for one check and exit, no diff analysis. Combine with `--json` for a structured record an agent can act on |
| `--fix` | with `--explain`, print what an honest fix for that check looks like |
| `--markdown <file>` | also append a Markdown summary to this file, e.g. `--markdown "$GITHUB_STEP_SUMMARY"` |

Cross-runs pair original tests with a bounded set of baseline runner controls (Jest/Vitest
config files, pytest/unittest config and conftest.py), including restored deletions and removed
additions. Config changes trigger a separate baseline-controlled run even when tests are unchanged;
its failures are diagnostic evidence, not a cheating finding. Snapshot notes identify resolved
Git commit hashes, not trusted sources. Custom setup modules, installed dependencies and the runner
itself are not authenticated by these snapshots. Legitimate API/config changes can change results.

Dynamic test reports are project-controlled evidence, not authenticated proof that a test ran.
Duplicate identities, contradictory counts or streams, truncated reports and unsafe/missing JUnit
artifacts make the run inconclusive (`dynamic: skipped`, with a reason), not a cheating finding.
Any findings from an incomplete run are discarded. Coherent fabricated reports can still pass
these consistency checks; a completed run does not establish reporter authenticity. This is
executable-adapter validation, not additional live-verified agent or harness coverage.

Exit codes: `0` means no warning or error findings, `1` means warnings only, `2` means at least one error
was found, and `3` means Proctor itself failed before it could complete the check. With `--ci`,
warnings exit `0` and remain in machine-readable reports and Markdown. Invalid arguments can
exit `1` (Commander usage errors) or `2` (validation errors); `--ai` without its key exits `1`.
The pre-commit hook propagates `3` and blocks. The Stop hooks allow infrastructure
failures, as described below.

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
writes to `.husky/pre-commit` and stages it, otherwise uses Git's configured hook directory
(normally `.git/hooks/pre-commit`, respecting worktrees and `core.hooksPath`).

Only error-severity findings block the commit. Warnings are printed so you see them, but the
commit still goes through, the same policy the Claude Code Stop hook follows. If you already have
a pre-commit hook from another tool, proctor backs it up to `pre-commit.bak` before writing its
own, and tells you it did.

### `proctor stop-hook`

Reads the hook payload from stdin and runs `check --uncommitted --ci`.

| Flag | What it does |
|------|--------------|
| `--format <format>` | `claude` (default) keeps the Claude Code protocol: findings on stderr and exit `2` to block, never `1`. `codex` writes one JSON block decision on stdout and always exits `0`. `gemini` writes one JSON deny decision on stdout and always exits `0` |

In Codex format, a blocking finding prints exactly `{"decision":"block","reason":"<finding output>"}`,
with the complete finding output encoded as one string. A clean check or skip prints nothing.
All formats skip when the input has `stop_hook_active: true`, preventing a retry loop, and use
the session working directory when the payload omits `cwd`.

```bash
proctor stop-hook --format codex
```

`proctor setup --agents codex` registers `npx @kavishdua/proctor stop-hook --format codex` in
`.codex/hooks.json` with a 60-second timeout. Codex must trust the project and the new or changed
hook must be reviewed via the prompt or `/hooks` before it runs. See the
[Codex hooks contract](https://learn.chatgpt.com/docs/hooks.md). Internal failures produce no
stdout, bounded UNVERIFIED stderr, and documented nonblocking exit `1` (not blocking exit `2`).

In Gemini format, AfterAgent receives one JSON object on stdin, including `prompt` (the original
request), `prompt_response` (the final text), and `stop_hook_active` (the retry guard). The hook
checks the diff rather than those text fields. A blocking finding prints exactly
`{"decision":"deny","reason":"<finding output>"}` with exit `0`, so Gemini sends the finding
feedback to the agent as a new correction prompt. It never uses `continue: false`, which would
stop the session without retrying. Stdout contains only the final JSON object; plain text would
break Gemini's parsing and allow the turn. Clean checks, loop-guard skips and malformed input
produce no stdout or stderr and exit `0`.
Internal failures allow with bounded UNVERIFIED stderr diagnostics, no stdout, and exit `1`
(a nonblocking warning, not the blocking exit `2`).

```bash
proctor stop-hook --format gemini
proctor setup --agents gemini-cli
```

Setup registers `npx @kavishdua/proctor stop-hook --format gemini` under `hooks.AfterAgent` in
`.gemini/settings.json`, matching the scoped npm command convention used for Codex. The group
uses `matcher: "*"`; its command has `name: "proctor"`, `type: "command"`, `timeout: 60000`
(milliseconds), and `description: "Block AI test tampering before the turn ends"`. It preserves
existing settings and hooks and leaves an already installed entry alone. Detected Gemini CLI
targets, explicit `--agents gemini-cli`, and `--all` all install the hook. Setup prints the hook
fingerprint/trust guidance and `/hooks` management command.

The Gemini extension bundles the same protocol in `hooks/hooks.json`, as required by the
[extension reference](https://geminicli.com/docs/extensions/reference/#hooks); hooks are not an
inline manifest field. It invokes `node "${extensionPath}/dist/cli.js" stop-hook --format gemini`
to use the shipped build without requiring a separate npm install. `gemini-extension.json`
continues to load `PROCTOR.md` as context.

Local verification covers deny feedback for a deleted test, silent clean/skip/malformed
outcomes and nonblocking UNVERIFIED error diagnostics, setup/uninstall round-trips, and execution of the bundled extension command. Live
Gemini CLI sessions were not exercised. AfterAgent timing and correction/retry semantics follow
the [Gemini hooks contract](https://geminicli.com/docs/hooks/reference/#afteragent).

It reads staged, unstaged, and untracked changes. It allows the turn outside a git repository,
during a merge, rebase, cherry-pick, or revert, or if proctor errors or takes longer than 60 seconds.

#### `--format antigravity`

For the Antigravity CLI Stop hook (`antigravity-plugin/`). Takes the repo from `workspacePaths[0]`
and returns `{"decision":"block","reason":"..."}`. It never skips on `executionNum`: every Stop
re-checks and re-blocks while a finding remains, up to a per-conversation budget (default 5).
Unknown check or persistence results allow with
empty stdout, bounded UNVERIFIED stderr and exit `0`. Unlike Codex/Gemini, a nonblocking
warning exit is not established for this adapter, so exit status alone does not establish
that a check or record succeeded. A known count survives a missing optional `executionNum`;
only explicit zero establishes a new turn. Missing/corrupt/unwritable state is not invented
as count zero. In enforce mode a verified finding is recorded for review when the budget
cannot be verified, without asserting exhaustion. Advisory mode records nothing. A failed
record write stays UNVERIFIED, not a durable gate. Clean checks reset the budget only after
successful atomic persistence; skipped or failed checks do not reset it.

| Environment variable | What it does |
|------|--------------|
| `PROCTOR_STOP_HOOK_BLOCK_BUDGET` | consecutive blocks per conversation, integer 1-50 (default 5) |
| `PROCTOR_STOP_HOOK_MODE` | `enforce` (default) records unresolved findings when the budget runs out; `advisory` opts out of the record |

### `proctor unresolved`

Shows findings left unresolved after budget exhaustion or failed budget verification (stored in
`proctor/unresolved.json` inside the worktree's git directory). Exits 0 when none, 2 when
unresolved, 3 when the record is unreadable.

| Flag | What it does |
|------|--------------|
| `--verify` | run a fresh complete check (working tree against HEAD, and commits since the finding's baseline) and clear the record only if both pass |
| `--gate` | quiet `--verify` for the pre-commit hook: 0 clean or none, 2 findings remain, 3 could not verify |

`proctor unresolved` also reports whether this worktree's pre-commit hook has the gate; hooks written by older versions do not, so rerun `proctor install-hook` (a foreign hook is backed up to `pre-commit.bak`). Findings are redacted for credential-looking literals before storage. If another process records a finding while `--verify` runs, that record is kept. Only `--verify` and `--gate` clear the record. A check that errors, or a baseline commit that no
longer exists, is reported as unverified and keeps the record. It is local feedback: anyone with
write access to the git directory can remove it, and `git commit --no-verify` skips the gate. Use
`proctor check --base <ref>` in CI, outside the agent's control, as the independent check.

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
each shared file, the adapter manifest, the pre-commit hook, the Claude Code and Codex Stop
hook entries, and proctor's Gemini AfterAgent command. Unrelated hooks and settings stay in place,
including commands in the same AfterAgent group. To remove the separately installed Gemini
extension and its bundled hook, use `gemini extensions uninstall proctor`.

| Flag | What it does |
|------|--------------|
| `--dry-run` | list what would be removed without removing it |

Shared files keep your content and lose only the managed block. Files left empty are deleted.
Uninstall leaves foreign or extended pre-commit hooks, other `Stop` hooks, and
`proctor.config.json` in place.

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

### `proctor doctor`

Audits the enforcement chain: ruleset deployed and undrifted, pre-commit hook and unresolved
gate installed, agent Stop hooks, CI workflow, and CODEOWNERS coverage of `.github/`. Each layer
is reported MISSING, CONFIGURED, or UNVERIFIED. CONFIGURED means the local file or setting
exists; proctor never reports a local file as an independently verified gate. Exits `1` when any
layer is missing.

Doctor is offline by default. With explicit `proctor doctor --github` opt-in and a github.com origin remote, doctor verifies server-side rules at the owning
source with read-only GitHub API GET requests (repository metadata, branch rules, ruleset
configuration and enforcement mode). Rules from rulesets in evaluate mode are reported as
logged-not-enforced, bypass actors are named by role, and any API failure is reported UNVERIFIED
rather than as absent protection. SERVER-OK means the server confirmed the configuration at that
moment; it is not proof of agent-independent enforcement, because doctor cannot check whether the
agent's credentials hold admin or settings write access. An existing `GITHUB_TOKEN`/`GH_TOKEN`
environment variable is sent as the Authorization header so private repositories can be read;
its value is never printed. Only the repository owner and name appear in request URLs - no file
contents or block records leave the machine - and each run prints how many requests
it made. Use `--offline` to skip all network access (even with `--github`); server-side layers then report UNVERIFIED.

For shared files, only the managed block is compared. Your surrounding notes are ignored,
but deleting a previously deployed block counts as drift.

### `proctor watch`

Re-runs checks when files change. Use it in a second terminal to see findings while an agent
is still working.

Each run happens in its own process, so a check that fails cannot take the watcher down with it,
and `node_modules`, `dist`, `.git` and friends are ignored so an install or a build does not
trigger a run.

| Flag | What it does |
|------|--------------|
| `--staged` | check staged changes instead of the working tree |
| `--rules <ids>` | only run these checks |
| `--debounce <ms>` | quiet period before re-running, default `250` |

### `proctor score`

Reports how many recent commits have no blocking findings and which rules fire most often.

```bash
proctor score --last 50
proctor score --last 50 --author "some-agent"
```

Scores are recomputed from git history, with one check per commit and no separate history file.
`--last` defaults to 20 to limit the work per run.

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

Use `--min-rate` as a CI gate for the share of commits without blocking findings:

```bash
proctor score --last 50 --min-rate 90
```

If no commits can be scored, the command prints a note and passes the gate.

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
| `--resume` | reuse completed tasks from `<out>.partial.csv` |

See [`bench/METHODOLOGY.md`](../bench/METHODOLOGY.md) for the full methodology.
