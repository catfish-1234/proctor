# Troubleshooting

Common problems and how to check them.

## The Stop hook never fired

Your agent deleted a test, finished its turn, and proctor said nothing.

**Restart your agent after installing.** Claude Code reads `.claude/settings.json` at startup. A
hook added mid-session does not take effect until you restart, and depending on your settings you
may also be asked to approve it the first time it runs.

**Check it is actually installed:**

```bash
cat .claude/settings.json
```

You want a `Stop` entry whose command contains `proctor stop-hook`. If it is missing, run
`proctor setup` again, or `proctor install-claude-hook` for just this part.

**The hook is installed but never blocks.** It deliberately fails open. It allows the turn when it
is outside a git repository, when proctor itself errors or takes more than 60 seconds, and during a
merge, rebase, cherry-pick, or revert. That last one matters: mid-merge the working tree holds the
incoming branch's changes too, so a test that branch deleted would look like this turn deleting it.
The pre-commit hook checks the staged resolution.

**Check whether the file is ignored.** The Stop hook includes staged, unstaged, and untracked
files. Untracked files ignored by Git and untracked dependency/build trees are excluded.

Run the check by hand to see what the hook sees:

```bash
proctor check --uncommitted
```

If that finds nothing, no enabled rule matched the change.

> Older source checkouts used a staged-only Stop hook. Re-run `proctor setup` to update an
> existing installation.

## I got a false positive

First, ask what the check actually saw:

```bash
proctor check --explain RH004        # what this check looks for
proctor check --explain RH004 --fix  # what an honest fix looks like
```

If the finding is incorrect, suppress that line:

```js
// proctor-ignore: RH004 reason: extension-to-language mapping table, not a fixture hardcode
```

**Commit the marker first.** Suppressions come from the committed baseline. A marker added
alongside the flagged change has no effect.

To turn a rule down repository-wide instead, set its severity in `proctor.config.json` (see
[CONFIGURATION.md](CONFIGURATION.md)). A `warn` still prints and still appears in reports; it just
stops blocking.

If the check is wrong in a way that would be wrong for anyone,
[open an issue](https://github.com/catfish-1234/proctor/issues/new/choose) with the diff that
triggered it so the check can be fixed.

## `proctor approve` didn't take effect

Approvals are read from the **committed** `proctor.config.json`, for the same reason suppressions
are. `proctor approve` writes the file; you still have to commit it:

```bash
proctor approve RH001 tests/legacy.test.ts --reason "billing v1 removed in RFC-88"
git add proctor.config.json && git commit -m "chore: approve RH001 for legacy billing"
```

If you see `proctor.config.json differs from the version at HEAD; enforcement uses the committed
version`, that is this exact situation: your edit is real, it just isn't in force yet.

Approved findings remain in text, JSON, and SARIF reports and withhold the honest-pass badge.
The approval makes them non-blocking.

## `npx` can't find the package

```
npm error could not determine executable to run
```

The package has not been published to npm yet, so registry-based `npx @kavishdua/proctor` commands
currently return 404. Build a tarball from a Proctor checkout and install it in the guarded
repository first:

```bash
npm ci
npm run build
npm pack
# Then, in the guarded repository:
npm install --save-dev /absolute/path/to/kavishdua-proctor-*.tgz
npx proctor check
```

After the first public release, a 404 should instead prompt a registry check with
`npm config get registry` and a check for a proxy that blocks npm.

## `proctor bench` says there are no tasks

The benchmark corpus is included in the git repository but omitted from the npm package.
Run it from a clone:

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install && npm run build
node dist/cli.js bench --mock
```

## `setup` wrote fewer files than I expected

By default, `setup` installs to detected agents. Check the detection results:

```bash
proctor agents
```

If your agent is not detected, either its config directory is not present yet, or you can name it
explicitly:

```bash
proctor setup --agents cursor,claude-code
proctor setup --all                        # every supported agent
```

## Something else

Open an issue at <https://github.com/catfish-1234/proctor/issues>. Include the output of
`proctor check --json`, your `proctor.config.json` if you have one, and the diff that produced the
surprise.
