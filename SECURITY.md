# Security policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/catfish-1234/proctor/security/advisories/new).
Please don't open a public issue for a security problem.

Expect an acknowledgement within 7 days. If the report is confirmed, a fix and an advisory follow;
you'll be credited unless you'd rather not be.

## Supported versions

The latest published version on npm is the supported one. This is a single-maintainer project and
there are no long-term support branches.

## What proctor does on your machine

Worth knowing, because it shapes what a vulnerability here would mean:

- **It writes executable git hooks.** `proctor setup` and `proctor install-hook` write
  `.git/hooks/pre-commit` (or `.husky/pre-commit`). If a hook from another tool is already there,
  it is copied to `pre-commit.bak` before being replaced, and you are told.
- **The hooks it writes invoke `npx @kavishdua/proctor`,** which fetches from the npm registry if
  the package isn't installed locally. That is a supply-chain surface: the hook runs whatever that
  package resolves to at the time.
- **It writes into `.claude/settings.json`,** merging a `Stop` hook entry into whatever is already
  there. Malformed settings are reported, never overwritten.
- **It runs `git` as a subprocess.** Arguments are always passed as an array, never through a
  shell, and refs are separated with `--end-of-options` so a ref beginning with `-` cannot be
  parsed as a git option.
- **The deterministic core makes no network calls at all.** The only outbound request in the entire
  tool is the optional AI judge, reached solely via `--ai`, which requires `ANTHROPIC_API_KEY` to
  be set explicitly.
- **It reads untrusted input**: diffs, and a hand-editable `proctor.config.json`. Config is
  normalized and validated rather than trusted, and diff lines are capped at 4000 characters as a
  systemic backstop against regex denial of service.

## Things that are deliberate, not bugs

- **Config and approvals are read from the committed baseline, not the working tree.** A change
  cannot disable proctor, approve itself, or add its own suppression marker in the same breath.
  If it could, the guard would be worthless against exactly the agent it exists to stop.
- **The Stop hook fails open.** If proctor errors, times out, or runs outside a git repository, the
  turn is allowed. A guard that breaks should not become a wall. It means a crash is an availability
  problem, not a bypass to report, though a *reliable, triggerable* crash that suppresses findings
  is worth reporting.
- **The pre-commit hook is bypassable with `git commit --no-verify`.** proctor guards against an
  agent taking a shortcut, not against a determined human with shell access to their own repo.
