# Security policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/catfish-1234/proctor/security/advisories/new).
Please don't open a public issue for a security problem.

Expect an acknowledgement within 7 days. If the report is confirmed, a fix and an advisory follow;
you'll be credited unless you'd rather not be.

## Supported versions

The latest published npm version (currently 1.1.0) and the current `main` branch are supported;
there are no long-term support branches.

## What proctor does on your machine

These operations affect the scope of a security report:

- **It writes executable git hooks.** `proctor setup` and `proctor install-hook` write
  Git's configured hook directory (normally `.git/hooks/pre-commit`) or `.husky/pre-commit`.
  Worktrees and `core.hooksPath` can place hooks outside the working tree. An existing foreign hook
  is copied to `pre-commit.bak` before being replaced, and you are told.
- **The hooks prefer the repository's local Proctor binary, then a global `proctor` on PATH, then
  `npx @kavishdua/proctor`.** It is a supply-chain surface because it may fetch from the registry. A local dev dependency is
  therefore the recommended hook installation.
- **It writes into `.claude/settings.json`,** merging a `Stop` hook entry into whatever is already
  there. Malformed settings are reported, never overwritten.
- **It runs `git` as a subprocess.** Arguments are always passed as an array, never through a
  shell, and refs are separated with `--end-of-options` so a ref beginning with `-` cannot be
  parsed as a git option.
- **The deterministic core makes no network calls at all.** The only outbound request in the entire
  tool is the optional AI judge, reached solely via `--ai`, which requires `ANTHROPIC_API_KEY` to
  be set explicitly and sends candidate code to Anthropic. Git external diff drivers and textconv
  commands are disabled when constructing patches.
- **It reads untrusted input**: diffs, and a hand-editable `proctor.config.json`. Config is
  normalized and validated rather than trusted, and diff lines are capped at 4000 characters as a
  systemic backstop against regex denial of service.

## Things that are deliberate, not bugs

- **Config and approvals come from the committed baseline.** An approval or suppression added
  alongside a flagged change does not take effect for that change.
- **The Stop hook fails open.** If proctor errors, times out, or runs outside a git repository, the
  turn is allowed. This preserves interactive availability. A reliable, triggerable crash that
  suppresses findings is still worth reporting.
- **The pre-commit hook fails closed.** A verifier exception or other incomplete check exits `3`,
  which the hook propagates to block the commit. This differs from the Stop hook's availability
  policy above.
- **The pre-commit hook is bypassable with `git commit --no-verify`.** proctor guards against an
  agent taking a shortcut, not against a determined human with shell access to their own repo.
