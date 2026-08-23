# Configuration

proctor runs with no config file. This page is for the cases where you want to change
something: approving a genuine test change, adjusting severities, or silencing one line.

Drop a `proctor.config.json` in your repo root (it's validated against
[`proctor.schema.json`](../proctor.schema.json)):

```json
{
  "enabled": ["RH001", "RH002", "RH003", "RH006", "RH007"],
  "severity": { "RH006": "warn" },
  "testPathGlobs": ["**/*.test.ts", "**/*.spec.ts"],
  "ignorePatterns": ["fixtures/**"],
  "approvedTestChanges": [
    { "rule": "RH001", "file": "tests/legacy-billing.test.ts", "reason": "billing v1 removed in RFC-88" }
  ]
}
```

| Field | Type | What it does |
|-------|------|---------|
| `enabled` | `string[]` | which checks to run. Defaults to the RH family, `RH001` through `RH014`. The beta WI family, `WI101` through `WI113`, is opt-in: list the IDs you want here, or pass `--wi` / `--all-checks` for a single run |
| `severity` | `object` | override how serious a check is, per check ID (e.g. `"RH006": "warn"`) |
| `testPathGlobs` | `string[]` | glob patterns that identify your test files |
| `ignorePatterns` | `string[]` | glob patterns for files to ignore entirely |
| `approvedTestChanges` | `object[]` | genuine test changes you've approved, see [Approving a genuine test change](#approving-a-genuine-test-change) |
| `aiModel` | `string` | which model the optional `--ai` judge uses. Defaults to `claude-haiku-4-5-20251001` |
| `snapshotGlobs` | `string[]` | glob patterns that identify snapshot and golden files for `RH006` |

One important detail: during a check, proctor reads `proctor.config.json` from the committed
version (`HEAD`, or the `--base` ref), not from your working tree. This is deliberate. If the
config were read from the working tree, the very diff being checked could turn proctor off in the
same change it cheats in. Commit your config first and it takes effect; an uncommitted config edit
is reported on stderr and flagged by `RH007`, but not honored until it lands.

### Approving a genuine test change

Sometimes the test really does need to go. A feature got cut, a suite got consolidated, an
assertion was over-specified and testing the wrong thing. proctor can't tell that apart from a
cheat by looking at the diff, because on the surface they're the same edit. So it doesn't try to
guess. It asks you to say so:

```bash
proctor approve RH001 tests/legacy-billing.test.ts --reason "billing v1 removed in RFC-88"
```

That writes an entry into `proctor.config.json`:

```json
{
  "approvedTestChanges": [
    {
      "rule": "RH001",
      "file": "tests/legacy-billing.test.ts",
      "reason": "billing v1 removed in RFC-88"
    }
  ]
}
```

Two things make this safe to have.

**An approval downgrades, it never hides.** The finding drops to `info` so it stops blocking your
commit or the agent's turn, and that's all it does. It still prints, with your reason attached. It
still shows up in `--json` and in `--sarif`, so it still becomes a PR annotation your reviewers
see. And the run no longer earns the honest-pass badge. An approved cheat is a cheat somebody
signed their name next to, which is a very different thing from a cheat nobody saw.

**An approval has to be committed first.** Approvals are read from the committed config like
everything else, so a change can't approve itself in the same breath. `proctor approve` writes the
file and then reminds you to commit it. If an agent adds an approval and cheats in one change,
the approval isn't in effect yet and the cheat still blocks.

`file` takes a glob, so `"src/legacy/**"` works for retiring a whole directory. Keep approvals as
narrow as you can stand: an approval is a standing decision, and a broad one quietly covers
changes you never looked at.

### Inline suppression

If a finding is a false alarm, or you have a good reason for what looks like a cheat, mark it with
a comment right in the code. This works for any check, including `RH006` (a snapshot change with a
stated reason) and `RH010` (a genuinely slow test that needs a longer timeout):

```ts
// proctor-ignore: RH003 reason: intentionally skipped, tracked in JIRA-1234
it.skip('flaky in CI', () => { /* ... */ });
```

```python
# proctor-ignore: RH010 reason: big_table has ~40M rows in CI's seeded dataset, genuinely slow
@pytest.mark.timeout(300)
def test_migration_runs():
    ...
```

**The marker must predate the diff.** A `proctor-ignore` comment only counts as justification if
it already existed in the base version, as an unchanged line before this diff, not one added in
the same commit as the change it excuses. This is deliberate: without it, the same agent making a
cheat could just as easily fabricate a plausible-sounding excuse for it in the same breath, since
nothing would distinguish "a pre-declared, genuine exception" from "a self-issued excuse invented
after the fact." Requiring the marker to predate the diff means a genuine exception has to be
committed before the change it justifies, in a separate, prior commit, closing that self-approval
loophole without requiring a human to review anything in real time.

A plain comment with no `proctor-ignore:` marker never counts as justification on its own, since
that would be trivial to fake. The marker is a deliberate, structured thing to type, similar in
spirit to a `--no-verify` flag: it's there when you need it, but you won't type it by accident, and
now it also can't be typed and immediately cashed in the same breath.
