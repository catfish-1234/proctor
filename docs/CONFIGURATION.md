# Configuration

proctor works without a config file. To choose checks, adjust severities, or approve a test
change, add `proctor.config.json` at the repo root (the schema is
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
| `enabled` | `string[]` | which checks to run. Defaults to RH001 through RH014 plus WI101, WI102, WI105, WI108, WI109, and WI110. The other WI checks remain opt-in. An explicit list replaces these defaults. Pass `--wi` / `--all-checks` to add the entire WI family for one run |
| `severity` | `object` | override how serious a check is, per check ID (e.g. `"RH006": "warn"`) |
| `testPathGlobs` | `string[]` | glob patterns that identify your test files |
| `ignorePatterns` | `string[]` | glob patterns for files to ignore entirely |
| `approvedTestChanges` | `object[]` | genuine test changes you've approved, see [Approving a genuine test change](#approving-a-genuine-test-change) |
| `aiModel` | `string` | which model the optional `--ai` judge uses. Defaults to `claude-haiku-4-5-20251001` |
| `snapshotGlobs` | `string[]` | glob patterns that identify snapshot and golden files for `RH006` |

During a check, proctor reads the config from `HEAD` or the `--base` ref. Commit config changes
before the code changes they should apply to. Uncommitted config edits are reported on stderr
but do not affect enforcement. RH007 also flags them; the opt-in WI104 check inspects attempts
to weaken enforcement.

### Approving a genuine test change

Removing a feature, consolidating a suite, or correcting an over-specified assertion can be
legitimate. If proctor flags such a change, record why you approved it:

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

**Approvals make findings non-blocking.** A matching finding drops to `info` and retains your
reason in text, JSON, and SARIF reports. When Code Scanning is enabled, reviewers can still see
the annotation. A run with approved findings does not earn the honest-pass badge.

**Commit approvals first.** `proctor approve` writes the config and reminds you to commit it.
An approval added in the change it covers is not yet in effect.

`file` accepts a glob, such as `"src/legacy/**"` for a retired directory. Keep patterns narrow:
an approval also covers future matching changes.

### Inline suppression

If a finding is a false alarm, or you have a good reason for what looks like a cheat, mark it with
a comment right in the code. This works for any check, including `RH006` (a snapshot change with a
stated reason) and `RH010` (a slow test that needs a longer timeout):

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

**Commit the marker before the change it covers.** The comment must exist as an unchanged line
in the base version. Adding it alongside the flagged change does not suppress the finding.

For this suppression mechanism, use the structured `proctor-ignore:` marker. An ordinary
comment is not a substitute.
