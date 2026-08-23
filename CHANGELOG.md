# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **The WI1xx work-integrity family is opt-in.** It ships as beta: run it with `proctor check --wi`
  or `--all-checks`, or list the IDs in `enabled` in `proctor.config.json` to apply it everywhere,
  hooks included. No check was removed or weakened; thirteen checks reading arbitrary source across
  25+ languages is a larger false-positive surface than the RH family's and has had less real-world
  exposure, so it earns default-on in a later release rather than assuming it.
- **Installing no longer writes to your repository.** `npm install` now prints exactly what
  `proctor setup` would write, and where, and stops. `proctor setup` is unchanged and still does the
  whole install; `PROCTOR_AUTO_SETUP=1` restores the previous install-and-wire behaviour, and
  `PROCTOR_NO_POSTINSTALL=1` silences the notice. An npm package that silently rewrites git hooks
  spends exactly the trust this tool is selling.
- **RH011 counts suppressions per file rather than per change**, and a suppression whose author
  wrote down why it is there no longer counts toward the threshold. Its message now reads "N of them
  in this file".
- The README CI example uses the `catfish-1234/proctor@v1` moving tag, with the full-SHA pin
  documented beside it as the stricter alternative.
- Releases publish with `npm publish --access public --provenance`.

### Fixed

Every fix in this group came out of a sweep of 689 human commits from 20 maintained repositories
(`sandbox/REALWORLD_FP_REPORT.md`). Together they take the share of real commits producing any
finding from 10.3% to 7.7%, and the share the default check set flags from 5.8% to 3.9%, with the
Part A catch rate unchanged at 12/12.

- **`check` no longer analyses `node_modules` on a first run.** Untracked discovery relies on
  `.gitignore`, which a brand-new repository does not have yet, so
  `npm init -y && npm i @kavishdua/proctor && npx proctor check` reported 73 errors inside other
  people's packages. Dependency and build trees are now skipped whether or not they are ignored.
  Tracked files are untouched.
- **WI103 no longer reads a `finally` block as unreachable code.** `} finally {` closes one block
  and opens a sibling whose body sits at the same indentation, so the first statement of every
  `finally` after an early `return` was reported as bypassed. This was the single largest
  false-positive source in the sweep.
- **RH004 and RH005 no longer read a relocated block as a gutted one.** A line deleted and re-added
  in the same chunk was moved, not written, so it now takes part in neither side of the
  return-pairing. The same locality bug as the earlier chunk-wide pairing fixes, on the move axis.
- **WI111 no longer says a test file "asserts nothing" when it plainly does.** It counted only the
  declarations the diff removed, so removing two cases from a forty-test file produced that message.
  A surviving declaration on an unchanged context line now suppresses it. A deleted build config or
  a deleted `*.test-d.ts` type-test file is no longer reported as a deleted implementation.
- **RH012 no longer reads a YAML comment or a composite action's input key as a test command.** The
  removal branch requires the line to be somewhere a command actually runs.
- **The WI family no longer treats markup and data files as code.** A build script embedded in a
  TOML string had its `catch {}` reported as a swallowed error in shipped code.
- **RH001 reports the whole test title** when it contains the other quote character. The truncated
  title was also the key deleted tests are paired against, so distinct tests collapsed onto one.

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

- **The WI1xx work-integrity family**, WI101 through WI112, reading shipped code for the ways an
  agent fakes a finished job without touching a test at all: an error swallowed, a guard deleted, a
  "not implemented" marker shipped, real I/O replaced with canned data, a type widened to `any`, a
  security control switched off, the code under test deleted. Opt-in and marked beta for this
  release, see Changed above.
- RH014 detects reduced property/fuzz counts, collection slicing/filtering, contracted loop bounds,
  and rows removed from parameterized tests while their names and assertions survive.
- WI113 detects benchmark workload reductions, dependency/version-floor rollbacks, and unexplained
  fixed delays used instead of fixing the exposed behavior.
- **A real-world false-positive corpus.** `sandbox/realworld/` clones 20 maintained open-source
  repositories and replays proctor over recent human commits, which is how every fix in this
  release's Fixed section was found. `sandbox/REALWORLD_FP_REPORT.md` has the numbers and the
  triage; the harness is `sweep.mjs`, `compare.mjs` and `lines.mjs` beside it.
- `check --wi` and `check --all-checks`, for running the beta WI family without editing config.
- A feature-request issue template, and a `language` field on the false-positive template.
- `assets/social-preview.png`, the 1280x640 card GitHub shows when a repository link is shared,
  generated by `scripts/social-preview.ps1`.
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
