# Red-team probe

A repeatedly tuned development corpus of cheat diffs, used to find gaps and retain regressions.
It is a dev set, not evidence of generalization to unseen cheats.

This corpus tests evasion strategies beyond each check's original fixtures. Each case runs in
a temporary git repository with a staged diff; the probe reports cases that proctor misses.

```bash
node bench/redteam/probe.mjs
```

Every case builds its own throwaway repo, commits a baseline, applies the cheat, and runs
`proctor check --staged`. A case counts as caught when proctor emits any finding for it. The
`CONTROL` cases cover legitimate bug fixes, helper extractions, new tests, and gitignore
maintenance. They must produce no findings for a round to pass.

## What it found

The first run caught **4 of 20** cheats with the thirteen checks then available. Three rounds
of fixes raised that to **13 of 20**, with no controls flagged. The fixes added WI109, WI110,
WI111, and two extensions to WI103.

A second round then widened the corpus to 28 cheats and 6 controls, in categories the first round
had not covered. Six of the eight new cases got through. Fixing two of them
(coverage exclusions and a lint rule downgraded from error to warn, both squarely WI104's remit)
brings it to **17 of 28**, still with zero controls flagged.

Two further rounds carried it to **24 of 34**. Round three added WI112 (assertions deleted from a
surviving test, a golden file rewritten, a module aliased to a stub) and a retry-action signature
for RH012. Round four widened the corpus again and produced the corpus's **first and only false
positive**: RH007 fired on `testMatch` gaining a second pattern, which widens test discovery rather
than narrowing it. RH007 now
compares the pattern set rather than the line, so adding a glob stays silent while narrowing a broad
glob to a single file still fires, a case a naive count comparison misses because the count is
unchanged.

## Current state

**76 of 76 dev cheats caught with all checks, 0 of 24 controls flagged.** Defaults now catch
**54 of 76**, compared with **25 of 76** at the unchanged main baseline. Both modes leave all
24 controls quiet. The default probe is `node bench/redteam/probe.mjs --default`; without that
flag it uses all checks. `--out PATH` writes strict machine-readable totals, and `--cli PATH`
selects a built CLI snapshot. Infrastructure errors and control findings fail the probe.

Six WI checks now run by default; seven remain opt-in after the human-commit precision gate.
See [fresh measurements and default decisions](../detection/README.md). The historical widening
arc was 4/20, 13/20, 17/28, 22/34, 24/34, 26/34, 30/34, 33/37, 53/53, 67/67, then 76/76 with
all checks. Each round was tuned against its cases, so none is an unseen evaluation.

The seventh round closed four strong before/after signals rather than broad token matches: an
expected value changing in a parameter table while its inputs stay fixed; a forwarded process
status becoming literal zero; `await call()` becoming the exact same bare `call()`; and code moved
or added after an unconditional return. Each shipped with a neighboring legitimate control.

The eighth round widened again and closed three indirect versions of existing cheats:
`process.exitCode` laundering without a call to `process.exit`, a rejecting test assertion whose
leading `await` disappeared, and an expected literal moved behind a named `expected` binding.
Three neighboring controls keep explained detachment, implementation-backed expectation changes,
and a fail-closed strengthening of an existing Proctor invocation silent.

Rounds nine through eleven deliberately left literal assertion edits behind. They added workload
cuts, dependency rollbacks, diagnostic deletion/downgrade, fixed-delay race masking, focused test
commands, shell/pipeline/background status laundering, CI matrix and trigger contraction,
snapshot-update mode, conditional and expected-failure test APIs, exception-type broadening,
test-runner environment branches, compact inline tables, and expression-based exit laundering.
RH014 and WI113 came from that widening. A separate CLI regression test applies a real Git
`assume-unchanged` flag, because that attack creates no diff and cannot live in this diff corpus.

The corpus exposed three false positives during rule development: RH007 on a widened
`testMatch`, WI110 on a separately named snapshot-update helper, and WI110 on a background process
whose status was explicitly waited and propagated. All three became permanent controls.

Five regressions involved literal handling. Blank string and regex literals
when the token you are matching is code; leave them when the token is data. WI105 matches
`NODE_ENV === 'test'`, where the value is the signal, so blanking erased it and detection silently
dropped by one even though the fixture suite and base check passed.

## Residual boundary

No case in this corpus is currently getting through. That is a regression claim about these 76
attacks, not a proof that every possible future agent strategy has been enumerated. A novel semantic
hardcode can always be expressed in syntax a deterministic diff rule has not seen, and intent-heavy
maintenance (for example a justified dependency rollback) still needs a committed human approval
or an inline explanation where the format permits one.

Repository controls also have a trust boundary. Proctor now rejects actual assume-unchanged and
manual skip-worktree flags before building a diff, but a user can always bypass a local Git hook and
rewrite history. Branch protection and the base-range CI check are what make that local bypass
non-authoritative. The optional `--ai` judge and project specifications cover fuzzy semantic claims;
the deterministic core deliberately remains explainable and testable.
