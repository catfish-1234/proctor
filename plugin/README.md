# proctor (Claude Code plugin)

Catches AI coding agents gaming their own test suites: deleting tests, skipping them, weakening
assertions, or hardcoding outputs to fake a green build.

## Install

```
/plugin marketplace add catfish-1234/proctor
/plugin install proctor@proctor-marketplace
```

## What you get

- **The honest-completion skill.** The ruleset Claude reads before touching a test or the code a
  test covers. Claude loads it on its own when a change is in that territory, and you can pull it
  up directly with `/proctor:proctor`.
- **A Stop hook.** Runs `proctor check --staged --ci` when a turn ends and blocks the turn on any
  error-severity finding, with the finding fed back so it can be fixed honestly. This is the part
  the agent cannot talk its way around: it reads the diff, not the explanation of the diff.
- **`/proctor:setup`.** Installs the git pre-commit hook and writes the ruleset out to every other
  agent your repo is set up for, so the same rules apply no matter which tool makes the next
  change.
- **`/proctor:check`.** Runs a check on demand and walks through what it found.

The hook shells out to `npx @kavishdua/proctor`, so the first run fetches the package. Node 20 or
newer is the only requirement.

## When a test change is genuine

Sometimes the test really does need to go. Record it and commit the result:

```bash
npx @kavishdua/proctor approve RH001 tests/legacy.test.ts --reason "billing v1 removed in RFC-88"
```

An approval stops the finding from blocking, and does nothing else. The finding still prints, still
lands in `--json` and `--sarif`, and the run no longer earns the honest-pass badge. Approvals are
read from the committed config, so a change cannot approve itself in the same breath.

Full documentation: <https://github.com/catfish-1234/proctor#readme>
