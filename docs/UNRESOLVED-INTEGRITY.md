# Unresolved-record integrity diagnosis (2026-11-09)

## Observed Windows failure, still unexplained

CI on result-contract PR94 at `ea79fccb8075108c5e5646d1ed0f7e90b2f99c22`
reported 15 durable occurrences after 16 concurrent two-phase Stop sequences:
https://github.com/catfish-1234/proctor/actions/runs/42723726762/job/129523893304

The test finished in 19.833 seconds. Its previous helper discarded every process's
stdout/stderr and ignored exit status, so the missing sequence cannot be reconstructed.
That duration does not support a 60-second check timeout or 30-second lock timeout as
the explanation for this occurrence. It does not rule out transient I/O or subprocess
failures, a missing budget write/read, or an unobserved failure to persist an exhausted Stop.

The strengthened test captures the code, output and elapsed time of both phases and
requires each initial block and each exhausted-record confirmation before asserting the
unchanged count of 16. The first instrumented comparison passed on both result-contract
code and the released 1.6.2 baseline:

- PR94: https://github.com/catfish-1234/proctor/actions/runs/42725385763
- Baseline-only diagnostic PR95: https://github.com/catfish-1234/proctor/actions/runs/42725388153

PR94's Windows leg instead failed in Gemini extension setup with a 10-second hook
setup timeout. That is a separate observation; no causal link to the record count is
established. Neither green concurrency comparison proves the original risk resolved.

## Reproduced source mechanism

Released 1.6.2's `recordUnresolved` resolves a path, takes its lock, then calls
`readUnresolved(cwd)`. That read resolves the Git directory a second time. If this second
Git call fails, it returns `none`. If reading the record fails (for example an injected
`EBUSY` sharing violation), it returns `corrupt`. The writer treats both as absence,
resets occurrences to 1, replaces original provenance/baseline and reports a successful
write. Malformed existing JSON is also overwritten this way.

A lost early occurrence can therefore remain invisible while later writes succeed.
The exclusive lock does not prevent this because the error is interpreting unreadable
history as absent history, not two successful writers entering together.

Three deterministic fault-injection regressions fail against the released source:

1. Fail the redundant second Git-directory lookup: the stored counter resets from 1 to 1
   instead of advancing to 2, and the original finding is replaced.
2. Refuse reads of existing history with `EBUSY`: the writer reports success and overwrites it.
3. Replace existing history with malformed JSON: the writer reports success and replaces it.

The narrow fix reads the already-resolved path while holding the lock and refuses to
replace unreadable or malformed history. The existing caller then reports that recording
could not be verified instead of claiming success. Existing bytes, original baseline and
provenance survive. Once a transient read recovers, a subsequent write can advance the
counter. Corrupt history requires explicit repair; it is not silently reset.

All three targeted regressions pass with this fix. They establish that these data-loss
mechanisms are closed, not that they caused the original Windows event.

## Stopping criterion and remaining uncertainty

Keep the original occurrence-count assertion and per-process capture. Check the focused
fix on all supported CI platforms. Do not weaken the count, increase timeouts as a guessed
fix, or rerun until a green result is called a diagnosis. Result-contract PR94 and its release
stay held pending an explicit review of the original uncertainty.

Budget state remains best-effort local feedback, and Stop infrastructure errors retain their
fail-open policy. A failed budget write/read can change whether an exhausted record is
attempted; this is a separate potential path, not proven by the old missing trace. These
records and hooks are agent-writable and are not independent enforcement.
