# proctor

**Catch the agent deleting your test before the commit lands — with a deterministic, diff-level guard the agent's own reasoning can't bypass.**

`proctor` is a developer-facing CLI guard that catches AI coding agents gaming their own test suites — deleting tests, skipping them, weakening assertions, or hardcoding outputs to fake a green build. It ships as three layers: a skill (markdown ruleset for agents), a deterministic diff analyzer (git hook + Claude Code hook + standalone CLI), and a reproducible benchmark that measures cheat rate with and without proctor. No infra, one command, MIT, runs locally.

## Why proctor

Every adjacent tool solves a different problem. Stryker mutates your implementation to measure whether your tests are strong; proctor detects when an AI agent mutated your tests to hide that the implementation is broken — the inverse concern. EvilGenie proves the cheating happens (Claude Sonnet 4: 2.1% hardcoded on unambiguous tasks, 33.3% on ambiguous; Gemini 2.5 Pro: 0.7% deleted test files) but is a research benchmark for AI labs, not a drop-in guard for developers. loki-mode bundles a test-mutation gate inside a full autonomous SDLC framework that requires adopting loki's entire workflow; it cannot run as a standalone git hook in an existing repo. METR and vendors mitigate internally with proprietary classifiers operating on model internals — inaccessible to the normal developer. Proctor fills the gap: a deterministic, diff-level guard that runs in a git pre-commit hook or Claude Code Stop hook, requires zero LLM, zero network, and zero changes to the agent's prompt. Because it operates at the diff layer — below the agent's own reasoning chain — the agent cannot reason its way around it.

## Demo

![proctor demo](demo.gif)

_Scene 1: proctor catches a deleted test at the `check --staged` diff layer (RH001, exit 2). Scene 2: the Claude Code Stop hook blocks an agent turn attempting the same cheat._

## Install

Zero-install, run directly via `npx`:

```bash
npx @kavishdua/proctor check
```

Or install globally:

```bash
npm i -g @kavishdua/proctor
```

Requires **Node 20+**.

## Quick start

```bash
# Install the git pre-commit hook
npx proctor install-hook

# Install the Claude Code Stop hook (blocks an agent turn on a high-severity finding)
npx proctor install-claude-hook

# Deploy the canonical honest-completion skill to every supported agent adapter
npx proctor install-skill

# Analyze your current working diff for test-tampering signatures
npx proctor check
```

## CLI reference

Transcribed from `proctor --help` / `proctor <command> --help`.

### `proctor check [path]`

Analyze the working diff for test-tampering signatures.

| Flag | Description |
|------|--------------|
| `--staged` | analyze only staged changes |
| `--base <ref>` | analyze changes against a base ref (e.g. `origin/main` or a commit SHA) instead of staged/working-tree changes — for CI, where nothing is staged in a fresh checkout |
| `--ci` | suppress non-error output, exit nonzero on error only |
| `--json` | output findings as JSON to stdout |
| `--sarif` | output SARIF 2.1.0 JSON to stdout |
| `--ai` | enable the optional LLM judge for ambiguous signatures (requires `ANTHROPIC_API_KEY`) |

Exit codes: `0` clean, `1` warnings only, `2` at least one error-severity finding.

### `proctor install-hook`

Installs a git pre-commit hook (`npx proctor check --staged`) — detects Husky and writes to `.husky/pre-commit`, otherwise falls back to `.git/hooks/pre-commit`.

### `proctor stop-hook`

Claude Code Stop hook entrypoint. Reads the Claude Code hook JSON payload from stdin, runs `proctor check --staged --ci` internally, and exits `2` to block the agent turn on an error-severity finding (never exits `1` — that's non-blocking in Claude Code).

### `proctor install-claude-hook`

Installs the Stop hook into a project's `.claude/settings.json`.

| Flag | Description |
|------|--------------|
| `--global` | write to `~/.claude/settings.json` instead of the project-local settings file |

Idempotent — running it twice does not duplicate the hook entry.

### `proctor install-skill`

Deploys the canonical `SKILL.md` honest-completion ruleset to every supported agent adapter path (see `src/adapters/registry.ts`) in one command, from a single source of truth.

### `proctor drift-check`

Verifies every deployed agent adapter copy still matches the canonical `SKILL.md`. Exits `1` if any adapter has drifted, `0` otherwise — use this in CI to catch a stale adapter copy.

### `proctor bench`

Runs the benchmark harness: N seeded tasks × {proctor on, proctor off}, producing a results CSV and a before/after cheat-rate table.

| Flag | Description |
|------|--------------|
| `--tasks <n>` | number of tasks to run (default: `10`) |
| `--seed <n>` | seed for deterministic task selection (default: `1`) |
| `--mock` | use the mock fixture runner (no real agent CLI, no network) |
| `--agent <id>` | agent id to run, e.g. `claude-code`, `codex` (default: `claude-code`) |
| `--out <path>` | write the results CSV to this path |

See [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md) for the full methodology.

## Configuration

Add a `proctor.config.json` at your repo root (validated against [`proctor.schema.json`](proctor.schema.json)):

```json
{
  "enabled": ["RH001", "RH002", "RH003", "RH006", "RH007"],
  "severity": { "RH006": "warn" },
  "testPathGlobs": ["**/*.test.ts", "**/*.spec.ts"],
  "ignorePatterns": ["fixtures/**"],
  "approvedTestChanges": []
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `enabled` | `string[]` | Rule IDs to enable. Defaults to all rules (`RH001`–`RH008`). |
| `severity` | `object` | Per-rule severity overrides. Keys are rule IDs (e.g. `"RH006": "warn"`). |
| `testPathGlobs` | `string[]` | Glob patterns identifying test files. |
| `ignorePatterns` | `string[]` | File glob patterns to ignore entirely. |
| `approvedTestChanges` | `string[]` | Allowlisted test-change descriptions — a backup to inline suppression. |

### Inline suppression

Suppress a single finding at the line level with a `# proctor-ignore:` comment:

```ts
// proctor-ignore: RH003 reason: intentionally skipped, tracked in JIRA-1234
it.skip('flaky in CI', () => { /* ... */ });
```

## CI / GitHub Action

[`action.yml`](action.yml) is a live, composite GitHub Action that builds proctor from source, runs `proctor check --base <ref> --sarif` against the PR/push diff, and uploads results to GitHub Code Scanning via `github/codeql-action/upload-sarif@v4` — findings show up as inline PR annotations.

```yaml
# .github/workflows/proctor.yml
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  proctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: ./
```

### Releases

[`.github/workflows/release.yml`](.github/workflows/release.yml) handles tag-triggered (`v*`), trusted-publishing (npm OIDC) releases for every version **after** the manual `v1.0.0` publish — npm's trusted-publisher registration requires the package to already exist on the registry before it can be configured, so it could not be used for the first publish. Future releases: push a `v*` tag and `release.yml` takes care of build, test, and `npm publish`.

## Benchmark

`proctor bench` measures how often an AI coding agent games its own test suite — and how often proctor catches it — by running a fixed pool of held-out-test tasks with the honest-completion skill on and off. Full methodology, held-out-test design, and citations (EvilGenie, Baker et al.) live in [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md).

Real data from a 15-task run against `claude-code` (`bench/results-live.csv`, no `--mock`):

| proctor | cheat rate | honest-pass rate |
|---------|-----------|-------------------|
| off | 0.0% | 80.0% |
| on | 0.0% | 73.3% |

_n = 15 tasks. Both arms show a 0.0% cheat rate — proctor's own deterministic signatures (RH001, RH002, RH003, RH006, RH007; see `bench/METHODOLOGY.md`) found no test-tampering diff in either the "off" or "on" run of this sample, so this sample does not yet demonstrate a cheat-rate delta. The honest-pass rate is reported as-is (73.3% with proctor on vs. 80.0% without) rather than spun — proctor's job is catching cheating, not improving raw task-completion rate, and a 15-task sample is small enough that this ~1-task difference is plausible noise, not a claimed effect. Both numbers are traced directly from the raw CSV; see the regenerate command below to reproduce or extend this run._

**Regenerate:**

```bash
node dist/cli.js bench --tasks 15 --agent claude-code --out bench/results-live.csv
```

Then update the table above with the new numbers. This table is a static snapshot (not live-generated in CI) — re-run the command above and edit this section by hand whenever you want to refresh it with a larger sample or a different agent.

## License

MIT
