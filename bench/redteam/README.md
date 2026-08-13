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

A second round then widened the corpus to 28 cheats and 6 controls, in categories the first round
had not thought of. Six of the eight new cases got through, which is the point of widening rather
than deepening: the ones already covered tell you nothing you did not know. Fixing two of them
(coverage exclusions and a lint rule downgraded from error to warn, both squarely WI104's remit)
brings it to **17 of 28**, still with zero controls flagged.

Two further rounds carried it to **24 of 34**. Round three added WI112 (assertions deleted from a
surviving test, a golden file rewritten, a module aliased to a stub) and a retry-action signature
for RH012. Round four widened the corpus again and produced the corpus's **first and only false
positive**: RH007 fired on `testMatch` gaining a second pattern, which widens test discovery rather
than narrowing it. That is worth more than any of the misses. A guard that punishes somebody for
broadening their test suite teaches exactly the wrong lesson, and it gets uninstalled. RH007 now
compares the pattern set rather than the line, so adding a glob stays silent while narrowing a broad
glob to a single file still fires, a case a naive count comparison misses because the count is
unchanged.

## Current state

**26 of 34 cheats caught, 0 of 8 controls flagged**, across six rounds. The arc was 4/20 → 13/20 →
17/28 → 22/34 → 24/34 → 26/34, and every round that widened the corpus found more than the rounds
that deepened it.

Two results from those rounds are worth more than the count.

The corpus produced exactly one false positive in six rounds: RH007 firing on a widened `testMatch`.
That is the failure mode to care about. A guard that reports somebody for broadening their test
suite gets uninstalled, and no amount of detection makes up for it.

The literal-handling rule was learned the expensive way, five times. Blank string and regex literals
when the token you are matching is code; leave them when the token is data. WI105 matches
`NODE_ENV === 'test'`, where the value is the signal, so blanking erased it and detection silently
dropped by one. Only this corpus noticed: the test suite was green and the base check was clean.

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
| A real module aliased to a stub in build config | WI105 reads source, not bundler aliases. Tractable: the alias target naming a stub or mock is a strong signal |
| Assertion count reduced by deleting one of several expects | RH009 covers a trivial test swapped for a real one, not assertions removed from a surviving test. Needs a per-test assertion count across the diff |
| `await` dropped so a rejection is never observed | A deleted `await` on a call that survives is a real signal and worth doing; distinguishing it from a deliberate fire-and-forget is the open question |
| A `setTimeout` sleep inserted to paper over a race | RH010 watches test timeouts and retries. The shipped-code equivalent is the same idea one layer over |

What is left is mostly not a regex problem. A dropped `await` and a deliberate fire-and-forget are
byte-identical diffs; so are a `setTimeout` papering over a race and a legitimate backoff, and a
dependency pinned to dodge a failure versus pinned for any other reason. The difference is intent,
and a diff does not carry intent.

Shipping signatures for those would mean firing on legitimate work, and round four already priced
that: one false positive on somebody widening their test suite costs more than several misses.
Pushing past this ceiling needs a different instrument, either the `--ai` judge on the ambiguous
cases or a specification to check against, both of which are deliberately outside the deterministic
core. That is a scoping decision rather than a missing regex.
