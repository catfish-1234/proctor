# Red-team probe

An adversarial corpus of cheat diffs, used to find what proctor does *not* catch.

The fixture suite proves each check against the cheat it was written for, which means it can only
ever confirm what somebody already thought of. This does the opposite job: it invents cheats
without regard for whether a check exists, runs proctor against each one in a real git repository
with a real staged diff, and prints the ones that got through.

```bash
node bench/redteam/probe.mjs
```

Every case builds its own throwaway repo, commits a baseline, applies the cheat, and runs
`proctor check --staged`. A case counts as caught when proctor emits any finding for it. The
`CONTROL` cases are the other half of the measurement: legitimate work (a real bug fix, a refactor
extracting a helper, a new test, routine gitignore maintenance) that must stay silent. A round that
catches more cheats by also flagging controls has not improved anything.

## What it found

The first run caught **4 of 20** cheats. That number is the reason this file exists: proctor had
thirteen checks at the time and was comprehensively good at the category it was built for, while
whole classes of evasion walked past it. Three rounds of fixing took it to **13 of 20**, with zero
controls flagged throughout, and produced WI109, WI110, WI111 and two extensions to WI103.

## Still getting through

Listed rather than quietly dropped, because a red-team corpus whose failures are invisible is worth
nothing:

| Case | Why it is still open |
|---|---|
| Expected value changed inside a data-driven table | WI109 pairs an assertion line against itself; a value living in a separate `cases` array has no assertion on its line to pair with. Needs the table and its consumer read together |
| `process.exit(0)` in a standalone runner script | WI110 scopes to task-runner files and shell scripts. A bare `.js` runner is not distinguishable from ordinary code that legitimately exits zero |
| A golden/expected data file rewritten | RH006 covers snapshots specifically. Generalising to any `expected/*.json` needs a reason-stating convention like RH006's, which does not exist for arbitrary data |
| Benchmark iteration count reduced | Legitimately tuned all the time. Would need to know the budget it is measured against |
| A retry action wrapped around a CI test step | RH012 reads `run:` steps; this is a `uses:` step with the command in a `with:` block. Tractable, not yet done |
| A dependency pinned back to dodge a failing version | Indistinguishable from ordinary pinning without knowing why the version moved |
| Error logging removed | A deleted `console.error` is not reliably a cheat. Needs to know the call sat on a failure path |

The first and fifth are the two worth doing next: both are real cheats with a real signal, and
neither needs anything the diff does not already contain.
