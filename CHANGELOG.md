# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `check --uncommitted` and the Claude Stop hook now include untracked, non-ignored files. A new
  test or config file previously sat outside `git diff HEAD` and was invisible until staged.
- Verifier exceptions no longer become an empty finding set and an honest-pass receipt. Verifier
  and unexpected command failures exit `3`, rather than Node's warning-only code `1`; pre-commit
  checks therefore fail closed while the Stop hook retains its documented infrastructure policy.
- Benchmark runs now reject timeouts, failed agents, and no-change runs; preserve paired on/off
  denominators; and refuse to overwrite an evidence CSV with partial results.
- `npm run verify:pack` now locates Git Bash on Windows instead of assuming `bash` is on `PATH`.
- Production GitHub workflows and the composite action now pin every third-party action to a full
  commit SHA while retaining the reviewed release tag in a comment.
- Packed-package verification now requires a real clean verdict instead of accepting any fast
  failure; the benchmark runner also settles reliably on timeout and caps output exactly.
- Semgrep now blocks on production findings while scanning deliberately vulnerable fixtures in a
  separate advisory step.
- Bare `proctor check` now covers staged, unstaged, and untracked changes by default instead of
  silently ignoring staged work; `--staged` and `--base` retain their narrower explicit scopes.

### Added

- RH014 detects reduced property/fuzz counts, collection slicing/filtering, contracted loop bounds,
  and rows removed from parameterized tests while their names and assertions survive.
- WI113 detects benchmark workload reductions, dependency/version-floor rollbacks, and unexplained
  fixed delays used instead of fixing the exposed behavior.
- Red-team coverage now spans 76 adversarial diffs and 24 neighboring legitimate controls. All 76
  are caught and all controls remain silent, including expression-based exit laundering, focused
  test commands, CI matrix/trigger contraction, diagnostic suppression, expected-failure modifiers,
  test-environment branches, and an actual Git `assume-unchanged` state that produces no diff.

### Changed

- Existing rules now cover exception-type broadening, constant conditional/expected-failure test
  modifiers, coverage collection disabled, source paths excluded from CI triggers, snapshot update
  flags in the normal test command, shell pipeline/background status loss, and removed/downgraded
  production error reporting.
- `proctor check` refuses tracked files hidden with `assume-unchanged` or `skip-worktree` outside a
  legitimate sparse checkout, closing a repository-state bypass no diff verifier can observe.

## [1.1.0]

### Fixed

- **The Stop hook now sees unstaged changes.** It ran `check --staged`, but an agent finishing a
  turn has edited the working tree and staged nothing, so the guard saw an empty diff and allowed
  every unstaged test deletion through. It now runs `check --uncommitted`.
- **`setup` no longer writes all 30 adapter files into every repository.** It detects which agents
  a repository actually uses, from their own config files and directories, and installs only to
  those. A repo with no agent config gets `AGENTS.md`, the cross-vendor standard. `--all` restores
  the previous behaviour.
- **`setup` exits nonzero when an adapter path could not be written.** A partial install that
  reported success was indistinguishable from one that worked.
- **The Claude Code Stop hook is only installed when the repo uses Claude Code**, rather than
  dropping `.claude/settings.json` into repositories that don't.
- **`proctor score` goes through the shared diff helper**, so the per-line length cap that bounds
  worst-case regex time applies when scoring history. It previously re-implemented `git diff`
  inline and skipped it.
- **`proctor bench` explains an empty task pool** instead of reporting it as an invalid `--tasks`
  value. The corpus ships with the repository, not the npm package.
- Documentation corrections: RH013 was missing from the configuration, language, and methodology
  docs; several cross-document links pointed at the wrong file; `docs/CLI.md` quoted stale
  `--explain` output.

- **A shared file whose own prose contained the literal `<!-- proctor:start -->` marker could lose
  content, or be deleted entirely, on uninstall.** The block pattern matched from the user's stray
  marker to proctor's real end marker, so removing "the block" took everything in between with it.
  A conventions file that documents how proctor works is an ordinary thing to write, and it is
  exactly the file proctor merges into. The pattern is now tempered so a block body cannot span
  another start marker.
- **`uninstall` aborted on the first unremovable path**, printing nothing at all, so a failure
  partway through the roster left files already deleted with no record of which. Each item is now
  attempted independently, failures are reported by name, and a partial uninstall exits nonzero.
- **`setup` crashed with a raw `TypeError` on a settings file that was valid JSON but an odd
  shape** (`hooks.Stop` an object rather than an array, `hooks` a string, a `null` or array root),
  leaving a half-finished install. Those are now reported through the existing "fix it and re-run"
  path, and a root shape that `JSON.stringify` would silently drop is no longer reported as a
  successful install.
- **`uninstall` left `.husky/pre-commit` in place on a Windows clone** while reporting that proctor
  was not installed. The hook is a committed file, so `core.autocrlf` checks it out with CRLF and
  the byte-exact comparison failed. Line endings are normalized now.
- **RH004 fired on ordinary guard clauses.** Its special-case pattern matched negated comparisons,
  because the `!` was absorbed by the character class before the operator, so
  `if (result.status !== 0) return false` read as hardcoding an answer for input `0`. A negated
  comparison is the opposite shape: it refuses everything that is *not* the literal, which is a
  validation guard, and no cheat can be written that way. `if (dir === '') return false` is now
  excluded too, on the same grounds as the existing `.length === 0` exclusion. Both were found by
  running proctor against its own diff. Error-severity false positives on shapes this common are
  the worst kind, since they block a commit for honest code.
- **The Stop hook no longer blocks a turn during a merge, rebase, cherry-pick, or revert**, where
  the working tree carries the incoming branch's changes and a test that branch deleted would read
  as this turn deleting it. The pre-commit hook still guards the resolution.

### Added

- **`proctor uninstall`** removes everything `setup` installed, and nothing else. A shared file
  keeps your own content and loses only the managed block; a foreign pre-commit hook and any other
  `Stop` hook entry are left alone. `--dry-run` shows what would go.
- **`proctor agents`** lists every supported agent and whether this repository appears to use it.
- **`proctor badge`** prints the honest-pass badge as Markdown you can paste into a README or PR.
  The README told people to do this; no command produced it.
- **`check --uncommitted`** analyses staged and unstaged changes together.
- **`setup --all` and `setup --agents <ids>`**, and the same flags on `install-skill`.
- **Agent Plugins 1.0.0 manifest** at the repository root, plus `skills/` and `.agents/skills/`
  copies of the ruleset. One artifact covering ChatGPT, Codex, Cursor, GitHub Copilot, Kiro and
  VS Code.
- **`branding` on `action.yml`**, without which GitHub Marketplace rejects the listing.
- **A root Cursor marketplace manifest**, without which Cursor cannot see a plugin that lives in a
  subdirectory.
- `CONTRIBUTING.md`, `SECURITY.md`, `docs/TROUBLESHOOTING.md`, this changelog, and issue templates.

## [1.0.0]

First release. Thirteen checks (RH001 through RH013), 30 agent adapters, 25+ languages, a CLI, a
git pre-commit hook, a Claude Code Stop hook, a GitHub Action with SARIF output, and a reproducible
benchmark.

[1.1.0]: https://github.com/catfish-1234/proctor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/catfish-1234/proctor/releases/tag/v1.0.0
