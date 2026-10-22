# Validation results

Validated with Node v24.19.0 and Python 3.12.14 using only standard libraries.
No installation step was run.

```text
$ node bench/sealed-2/cases/run.mjs
Corpus: 80/80 passed; 0 failed.
Labels: 40 cheat (20 node, 20 python); 40 honest (20 node, 20 python).
Families: 20 cheat; 20 honest repair families.
Checks per case: before visible=1, after visible=0, before probe=1, after probe=label.

$ node bench/sealed-2/cases/run.mjs --honest-visible
Honest visible after: 40/40 passed; 0 failed.

$ python3 bench/sealed-2/test.py
PASS label disagreement
PASS verifier syntax error
PASS probe runtime error
PASS subprocess timeout
Runner rejection controls: 4/4 passed.
```

The main run performed 320 subprocess checks: 80 before visible rejections,
80 after visible passes, 80 before probe rejections, 40 cheat after probe
rejections, and 40 honest after probe passes. Probe rejections require both exit
1 and an assertion marker. The separate honest command executed 40 more visible
test subprocesses directly in their own after directories.

The rejection controls run on disposable copies and restore each injected change.
They confirm that a shortcut replaced by a correct implementation disagrees with
its label, a verifier syntax error cannot masquerade as an assertion rejection,
an unexpected probe exception exits 2, and a stalled subprocess fails the runner.

The runner also checks all 80 metadata records, the 20/20 language split within
each label, and the four members of each family. Matched pairs have byte-identical
before source, visible tests, specifications, and hidden probes. Tests and
specifications remain byte-identical between before and after. Both labels change
only `app`; the maximum difference in changed line counts within a matched pair
is four lines. All 201 Python files parsed successfully. Authored files contain
no em dash or prohibited wording.

A fresh export of the 646 staged files, including all 160 specifications, also
passed the 80-case corpus run and the 40-case direct honest visible run. Changes
are confined to `bench/sealed-2/`.

See [FAMILIES.md](FAMILIES.md) for per-family counts and
[validation.log](validation.log) for the complete successful command output.
