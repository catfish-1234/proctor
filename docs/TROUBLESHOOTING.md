# Troubleshooting

The things that actually go wrong, and what each one means.

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
The pre-commit hook still guards the resolution, which is where it becomes your change.

**A brand-new file the agent never staged is not seen.** The hook reads tracked changes; a file
that git does not know about yet is invisible to it. `git add` the file, or rely on the pre-commit
hook, which sees it once it is staged.

Run the check by hand to see what the hook sees:

```bash
proctor check --uncommitted
```

If that finds nothing, the change genuinely did not trip a rule.

> Historical note: before v1.1 the Stop hook checked `--staged` only, so changes an agent had not
> staged were invisible to it. If you installed proctor before then, re-run `proctor setup`.

## I got a false positive

First, ask what the check actually saw:

```bash
proctor check --explain RH004        # what this check looks for
proctor check --explain RH004 --fix  # what an honest fix looks like
```

If it is genuinely wrong about your code, suppress that one line:

```js
// proctor-ignore: RH004 reason: extension-to-language mapping table, not a fixture hardcode
```

**The marker must already be committed.** proctor reads suppressions from the committed baseline,
not the working tree, so a marker added in the same change it excuses does nothing. That is
deliberate: an agent that could suppress a rule in the change that trips it would have no guard at
all. Commit the marker first, then make the change.

To turn a rule down repository-wide instead, set its severity in `proctor.config.json` (see
[CONFIGURATION.md](CONFIGURATION.md)). A `warn` still prints and still appears in reports; it just
stops blocking.

If the check is wrong in a way that would be wrong for anyone,
[open an issue](https://github.com/catfish-1234/proctor/issues/new/choose) with the diff that
triggered it. Precision bugs are worth fixing at the source.

## `proctor approve` didn't take effect

Approvals are read from the **committed** `proctor.config.json`, for the same reason suppressions
are. `proctor approve` writes the file; you still have to commit it:

```bash
proctor approve RH001 tests/legacy.test.ts --reason "billing v1 removed in RFC-88"
git add proctor.config.json && git commit -m "chore: approve RH001 for legacy billing"
```

If you see `proctor.config.json differs from the version at HEAD; enforcement uses the committed
version`, that is this exact situation: your edit is real, it just isn't in force yet.

An approved finding still prints, still appears in `--json` and `--sarif`, and still withholds the
honest-pass badge. Approving makes a finding non-blocking and visible, not invisible.

## `npx` can't find the package

```
npm error could not determine executable to run
```

Use the fully-scoped name. `npx proctor` only resolves after a global or local install; `npx
@kavishdua/proctor` always works:

```bash
npx @kavishdua/proctor check
```

If npm reports a 404 for the package, check your registry configuration
(`npm config get registry`) and that you are not behind a proxy that blocks it.

## `proctor bench` says there are no tasks

The benchmark corpus ships with the git repository, not the npm package, because it is a research
fixture rather than something every install should carry. Clone and run it from there:

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install && npm run build
node dist/cli.js bench --mock
```

## `setup` wrote fewer files than I expected

That is the intended behaviour as of v1.1. `setup` installs to the agents this repository shows
signs of using, not all 30. Check what it detected:

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
