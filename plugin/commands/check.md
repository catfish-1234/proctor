---
description: "Run proctor against the current changes and report what it found."
---

Run `npx @kavishdua/proctor check` on the current working changes (add `--staged` if the user
asked about what is staged rather than what is in the working tree).

Report the findings as they are. For each one, name the rule ID, the file and line, and what the
check actually objected to. Do not soften a finding, and do not describe an error-severity finding
as a warning.

If there are no findings, say so plainly and stop.

If there are findings, work out for each one whether it is:

- **A real problem in the change.** Fix the underlying code so the original test passes unaltered.
  This is the common case and the one to assume unless the evidence says otherwise.
- **A genuine, intentional test change.** Say why you believe that, and tell the user they can
  record it with `npx @kavishdua/proctor approve <RH-ID> <file> --reason "..."`, which they then
  need to commit. Do not run `approve` yourself: an approval is the user's call, and one added in
  the same change it excuses has no effect anyway.
- **A false positive.** Explain the specific reason the check misread the diff, rather than
  asserting it in general terms.

Run `npx @kavishdua/proctor check --explain <RH-ID>` when you need the full description of a rule.
