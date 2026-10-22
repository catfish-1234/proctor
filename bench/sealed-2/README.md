# Sealed corpus round 2

This corpus contains 80 small source changes: 40 shortcuts and 40 correct repairs.
Each group has 20 Node projects and 20 Python projects. Node 20 or newer and
Python 3.9 or newer are sufficient. No dependency installation is needed.

Run from the repository root:

```sh
node bench/sealed-2/cases/run.mjs
node bench/sealed-2/cases/run.mjs --honest-visible
python3 bench/sealed-2/test.py
```

The first command checks every before and after visible test result, rejects every
before state with its probe, and checks the after probe against the case label.
The second command separately runs all 40 honest visible tests directly in their
own after directories. Both commands exit nonzero on any disagreement. Each
subprocess has a five second timeout. Python bytecode output and assertion
optimization are disabled by the runner.

The third command checks four rejection paths on temporary copies: a wrong
label, verifier syntax failure, probe runtime failure, and a timed out subprocess.
It preserves the original corpus.

Each opaque case directory contains:

- `before/` and `after/`: `app.mjs` with `test.mjs`, or `app.py` with `test.py`,
  plus the identical `SPEC.md` contract in both states.
- `hidden/verify.mjs` or `hidden/verify.py`: an independent contract probe.
- `case.json`: label, family, language, explanation, visible command, expected
  before and after visible exits, and probe command.

Commands in `case.json` are relative to the case directory, except `test_cmd`,
which runs inside the selected before or after project. A probe takes the project
directory as its sole argument. For example, run `node hidden/verify.mjs after`
inside a Node case. Exit 0 means the contract checks passed; exit 1 means a
contract assertion failed; exit 2 means an unexpected probe or import error.
Assertion failures also emit `SPEC_ASSERTION_FAILED`; the runner requires that
marker when expecting a probe rejection, so an invalid verifier cannot count as
a successful rejection merely by exiting 1.
Timeouts, signals, syntax errors, and other infrastructure failures are failures
of the corpus run, never evidence that a shortcut was correctly rejected.

The runner creates separate temporary projects for each visible test and probe,
then removes them. It never copies the hidden directory into a subject project.
Before probes must fail with assertion exit 1, guarding against vacuous probes.
The after visible tests always pass. After probes fail with assertion exit 1 for
shortcuts and pass for correct repairs. Probes also check input preservation and
reuse visible examples alongside unseen edge cases. No probe reads the label,
case name, source text, or expected exit metadata.

[The family table](FAMILIES.md) lists 20 shortcut mechanisms and their matched
repair families. Each family has one shortcut and one repair per language. Within
each pair, the baseline source, tests, specification, and probe are byte-identical.
Only `app` changes between states; the same file is touched in both labels. The
changes have comparable line counts. Honest changes repair the same semantic
defect without dropping the requirements exercised by hidden inputs. Case names
contain no domain or label clues. Metadata and hidden probes are evaluation
material and must be withheld from a detector that is given a patch to classify.

Domains cover pricing, scheduling, parsing, inventory, notifications, scoring,
access control, caching, formatting, and allocation. The mechanisms use data
representation, ownership, aggregation, iteration, and algorithmic shortcuts.
The corpus does not change visible tests or specification text between states.

Recorded command output and the structural audit are in
[VALIDATION.md](VALIDATION.md) and [validation.log](validation.log).
