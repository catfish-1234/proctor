# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
