# Dynamic development set

These 168 authored cases are a tuned development set: 84 cheats and 84 honest twins.
They are small generated Git repositories using Node or Python standard-library tests.
The cases and implementation were developed together. These numbers do not establish
accuracy on other repositories. No separate evaluation corpus was used.

Build with `npm run build`, then run:

```sh
node bench/dynamic-dev/run.mjs > results.json
```

Execution needs Node, Python 3, Git and Linux bubblewrap with working namespaces. The case
projects need no installed test packages. The harness exits nonzero for a skipped case, a
missing expected finding, a blocked honest case or an unexpected advisory finding.
Two honest probe cases explicitly expect DY002 warnings, four honest differential cases expect
DY007 warnings, and two ambiguous-document cases expect DY008 warnings. `results.json` records
them as flags. The other honest cases still require
zero findings, and every honest case requires zero blocking findings.

## Repair hardening, tuned

The latest cohort adds 74 authored cases, with 37 shortcuts and 37 honest twins. Twelve pairs
exercise candidate wording and file coverage in Node and Python. The other pairs cover expanded
tests on legacy implementations, unchanged violations, exception refactors, renames, red
baselines, formatting repairs, unstable expectations and ambiguous file bindings. Some positive
controls reuse earlier templates. These are tuned case counts, not independent accuracy estimates.

DY009 candidate collection now uses literal unit or file mentions independently of the DY008
grammar. It handles prose without a required verb, wrapped sentences, multiple sentences per
line and source paths. The existing file, sentence and prompt caps still apply. Exact quotes,
fixed claim kinds and stable fresh-process runtime proof remain mandatory. A file basename must
be unique; a file-only mention with several exported units stays advisory. Vague prose without
a supported claim stays silent.

DY003 repeats its named outcomes in fresh copies before blocking. DY006 confirms a witness in
fresh subject and helper processes on both revisions. DY008 and DY009 require a new test claim
to distinguish revisions, plus changed concrete return values at a claim-backed violating input.
Expanded tests cannot promote an unchanged legacy violation, and renamed exceptions do not prove
a new return-value violation. Direct old-pass/new-fail documented regressions remain eligible.
Incomplete runs and unsupported values cannot establish a blocker. DY001 and DY002 stay advisory.
Unmarked sweeps also reuse precise unchanged general statement domains. This avoids allocation
widths outside the supported oracle; point examples and marked helpers do not narrow these
general sweeps. Integer boundaries remain available for unannotated and applicable numeric units.

Reproduce the three cohorts and enforce their previous blocking floors with:

```sh
node bench/dynamic-dev/recheck.mjs
```

Each cohort uses a private temporary root. Results preserve per-case outcomes and timings in
`hardening-existing-results.json`, `hardening-judge-results.json` and `hardening-results.json`.
Only fake judge commands run. These measurements do not measure a real service or model.

| Tuned cohort | Blocked shortcuts | Any shortcut finding | Blocked honest | Any honest finding |
| --- | --- | --- | --- | --- |
| Historical 168 cases, rerun | 43/84 | 80/84 | 0/84 | 8/84 warnings |
| Previous 84 mock-judge cases, rerun | 23/42 | 25/42 | 0/42 | 0/42 |
| New 74 repair and candidate cases | 32/37 | 35/37 | 0/37 | 1/37 warning |
| Total 326 cases | **98/163** | **140/163** | **0/163** | **9/163 warnings** |

All 326 cases completed without skips or unexpected outcomes. The two prior blocking counts
remain 43/84 and 23/42. Every authored honest case remains at zero blocking findings. Warnings
are reported separately. Judge verdicts are mocked, so these are runtime-gate measurements,
not real judge precision or combined static/dynamic recall.

The rerun CLI medians were 1048 ms for the historical cohort,
2246 ms for the previous mock-judge cohort and 2259 ms
for the new repair cohort. Combined CLI time was 606.35 seconds.
These tuned toy-fixture costs include CLI startup and static checks.

Ten warm interleaved samples per revision after three warmups compared b979148 with this
change on the same Ubuntu 22.04 CI runner. All judge calls were fake and cold where eligible.

| Tuned fixture | Before median | After median | Added cost |
| --- | --- | --- | --- |
| DY003 repeat controls | 658 ms | 931 ms | 272 ms |
| DY006 witness confirmation | 3012 ms | 3294 ms | 282 ms |
| New file-mention candidate and runtime verification | 611 ms | 2251 ms | 1640 ms |

Samples are in `hardening-runtime.json`. Reproduce against a separately built baseline with:

```sh
node bench/dynamic-dev/measure-hardening.mjs /path/to/b979148/dist/cli.js
```

The unchanged default CLI binary had the same SHA-256 as b979148. Twenty warm interleaved
samples per revision after five warmups gave tuned medians of 235 ms before and 230 ms after,
with identical stdout, stderr and exit status. Samples are in `hardening-default-runtime.json`.
This is host variation on one fixture, not a general speed claim. The shared 60-second dynamic
budget remains unchanged; slow suites, unsupported setup and stateful code can still skip.
Fresh processes reuse filesystem state, and no runtime check establishes intent.

## Blocking policy and tuned results

The harness isolates dynamic findings with `--rules RH014`; these counts are not combined
recall measurements for the existing static rules. Main 1.2.0 emitted no dynamic errors.

DY003 now blocks only when the edited expectation passes on old code and the original test
failed there. Its scope stays narrow: one test file with only equality-literal edits, unchanged
actual expressions, no changed non-test source or inputs, an unambiguous test identity and no
new SPEC/CHANGELOG intent note. The opposite outcome remains advisory. Error findings exit 2,
including with `--ci`; configuration opt-in uses the same policy as `--dynamic`. Fresh copies
now repeat the original failing test and the edited passing test on both revisions before blocking.
Unrelated red tests still do not gate these named comparisons.

| Tuned dev cases | Blocked cheats | Any cheat finding | Blocked honest | Any honest finding |
|----------------|----------------|-------------------|----------------|--------------------|
| Previous 72 cases | 3/36 | 32/36 | 0/36 | 0/36 |
| Eight expectation-promotion cases | 4/4 | 4/4 | 0/4 | 0/4 |
| Four probe-precision cases | 0/2 | 2/2 | 0/2 | 2/2 warnings |
| Twenty declared-contract cases | 10/10 | 10/10 | 0/10 | 0/10 |
| Four red-baseline contract cases | 2/2 | 2/2 | 0/2 | 0/2 |
| Four differential-precision cases | 0/2 | 2/2 | 0/2 | 2/2 warnings |
| Four output-collapse cases | 0/2 | 2/2 | 0/2 | 2/2 warnings |
| Forty precise-document cases | 20/20 | 20/20 | 0/20 | 0/20 |
| Four documented test-claim cases | 2/2 | 2/2 | 0/2 | 0/2 |
| Four documented arrow examples | 2/2 | 2/2 | 0/2 | 0/2 |
| Four ambiguous-document cases | 0/2 | 2/2 | 0/2 | 2/2 warnings |
| Total, 168 cases | **43/84** | **80/84** | **0/84** | **8/84 warnings** |

Projecting the same observed DY002 findings to errors would block **57/84 cheats and 2/84
honest cases**. This projection changes severity only; the commands, inputs and outcomes are
the recorded ones. The honest cases fix a zero sentinel and an empty-label exception required
by unchanged contracts. Their new branches differ from the old reference at exactly one probed
input, with matching neighbors. The old reference was buggy. DY002 promotion is therefore
rejected under the zero blocking false-positive requirement. Those two warnings remain visible.

DY006 adds blocking runtime contract evidence. An unchanged visible test file explicitly marks a
helper with `// proctor:contract NAME` or `# proctor:contract NAME`. The declaration says its
assertions apply independently to generated arguments of the observed types. Helpers and units
must be deterministic and independent of external state or framework setup. Only stable changes
outside fixture literals that pass the old helper and raise an assertion failure in the new helper
can block. The new visible suite must pass. A newly added or edited contract cannot block.
One candidate witness now also repeats in fresh subject and helper processes on both revisions;
batch-only behavior cannot establish a blocker. Incomplete runs, unsupported values and
inconsistent helper exits cannot supply blocking evidence.

The twelve contract pairs cover numeric sorting, signed sums, string widths, boolean domains,
collection maxima and offsets, including Node ESM and red-baseline mean fixes. The shortcut
implementations use ordinary operations, not a required literal-branch pattern. Honest refactors
and fixes preserve their declared properties: **12/12 cheats blocked and 0/12 honest cases flagged**,
all tuned. These cases start with authored contract markers. They do not measure automatic
blocking recall on repositories without those declarations.

Running default static checks on the same authored contract pairs blocks **1/12 cheats and 0/12
honest cases**, all tuned. Only the plain Python constant-boolean shortcut overlaps, through RH004.
DY006 therefore adds **11 blocking detections missed by static checks** in this subset. No combined
static/dynamic result is claimed for the full set. Reproduce the subset comparison with
`node bench/dynamic-dev/compare-static.mjs > static-comparison.json`.

DY007 keeps unannotated differential evidence advisory. Two normalization pairs and two
constant-output pairs have identical runtime observations across labels but different pre-existing
contracts. Promoting DY007 would block **47/84 cheats and 4/84 honest cases**, a tuned severity-only
counterfactual. Old code cannot serve as a universal oracle. Inferring intended input classes from
test names, nearby diff lines or a few literal calls does not resolve this ambiguity, so that
automatic blocking design was dropped. A declared contract supplies the missing oracle from the
visible tests themselves; this is not a claim that test authors cannot write a wrong contract.

DY001 regressions, DY004 surviving mutations and DY005 inconsistent runs remain advisory.
No static blocker was added: the guard-removal pairs below have identical observable edits for
both labels, and passing on both code revisions cannot establish cheating. Existing static
findings and default output are unchanged.

Rows use disjoint case families. Earlier additions covered typed probes, bare Python functions,
discovery errors, mutation-lite, expectation promotion and probe precision. An earlier 32-case
addition covered declared contracts and differential precision. The latest 52 additions cover
documented contracts and ambiguity. All remain part of the same tuning process.

| Idea | Kept behavior | Tuned development results |
|------|---------------|---------------------------|
| Original tests on new code | DY001 compares each named original test independently, including red baselines and new suites | 5/5 cheat cases found, 0/5 honest cases flagged |
| New tests on original code | Run it and note tests passing on both revisions; drop this as a standalone finding | 0/1 cheat found, 0/1 honest flagged; both outcomes are ambiguous |
| Perturbed inputs | DY002 executes an old unary arithmetic function and its new numeric literal branch at the literal and its two neighbors | 3/3 cheats found, 0/3 honest twins flagged |
| Expected-value edits | DY003 compares the edited test on old code: pass to fail or fail to pass with only an equality-literal edit | 3/3 cheats found, 0/3 honest twins flagged |
| Red-baseline probes | The new suite must pass; the old suite can fail | 2/2 cheats found, 0/2 honest fixes flagged |
| Red-baseline cross-run | Compare passing old tests even beside other old failures | 1/1 cheat found, 0/1 honest fix flagged |
| Red-baseline expectations | Gate on the edited test itself, including old failures made green by changing expectations | 2/2 cheats found, 0/2 honest fixes flagged |
| Plain Python files | Use file ids and direct exit codes when discovery finds no real cases | 3/3 cheats found, 0/3 honest fixes flagged |
| String and boolean probes | DY002 compares an executed simple reference at a string literal and two variants, or both boolean values | 5/5 cheats found, 0/5 honest fixes flagged |
| Bare Python functions and discovery errors | Isolate top-level functions with file/function ids; execute scripts after collection errors | 3/3 cheats found, 0/3 honest fixes flagged |
| Mutation-lite | DY004 deletes or negates parser-confirmed changed statements in functions observed during a green control run | 2/2 cheats found, 0/2 honest fixes flagged |
| Expectation promotion | DY003 acceptance on unchanged old code is blocking; documented stale-test corrections stay clean | 4/4 cheats blocked, 0/4 honest fixes flagged |
| Probe promotion trial | A general old reference can violate a pre-existing exception contract | 2/2 cheats warned, 2/2 honest fixes warned; no blocking findings |
| Declared behavior contracts | Reproduce generated-input assertion failures against an unchanged explicit helper | 12/12 cheats blocked, 0/12 honest cases flagged |
| Unannotated behavior sweeps | Broader differences or output collapse can also be legitimate fixes | 4/4 cheats warned, 4/4 honest fixes warned; no blocking findings |
| Precise documented contracts | Fresh runs violate unchanged literal examples or explicit universal rules, without a marker | 24/24 cheats blocked, 0/24 honest twins flagged |
| Ambiguous documented contracts | A vague ordering statement permits both ascending and descending behavior | 2/2 cheats warned, 2/2 honest twins warned; no blocking findings |
| Guard restoration | Dropped as a verdict; the harness restores each removed guard experimentally | Restoring a guard makes the new tests red for 3/3 cheats and 3/3 honest API relaxations |
| Sleep or retry repetition | DY005 compares four runs, requiring a passing result and at least two failures for the same named test | 3/3 cheats found, 0/3 honest twins flagged |

Earlier expansions added 16 red-baseline cases and 20 typed-probe, Python and mutation cases.
The twelve expectation-promotion and probe-precision additions also started red. The latest
contract additions include both green baselines and red-to-green fixes. All results are tuned.

Overall: **43/84 cheats blocked, 0/84 honest cases blocked, 0 skipped** on this tuned dev set.
Including advisory findings, **80/84 cheats and 8/84 honest cases** are flagged.
The four misses are the three guard-removal cases and the coverage-only case. A red restored
variant is evidence that tests depend on a guard being absent; it does not establish whether
removing that guard was legitimate. The repeat fixtures deliberately exercise persistent
state and order dependence. They are not a measurement of race detection on real schedules.

## Runtime measurement

The recorded JSON files contain the individual samples and host-specific commands. The
static comparison uses a trivial source diff with identical output and exit status, 20 warm
runs per revision, interleaved after five warm-ups each. To compare two built revisions:

```sh
node bench/dynamic-dev/measure-static.mjs /path/to/baseline/dist/cli.js dist/cli.js
```

The baseline is main at `a5f4700`, version 1.2.0, before the blocking policy change.
The tuned fixture medians were **210 ms before and 207 ms after** without dynamic opt-in. This is
one fixture on one Linux host, within run-to-run variation, not a general speed claim.
The tuned dynamic CLI median was **1,010 ms** across the 168 toy cases, with **299.89 seconds**
for all case CLI invocations combined. This includes CLI startup and static checking. Dependency-heavy
suites can cost much more and can exhaust the budget. Individual case timings are in `results.json`.
Absolute host Node executable paths in the recorded commands are normalized to `node`.

The earlier DY006 contract-cost trial used the honest numeric-sort dev fixture, comparing PR
revision `840ccae` against `af936e6`, with twenty warm interleaved CLI runs after five warm-ups
each. The tuned medians were **479 ms before and 2,760 ms after**, an additional **2,281 ms** on
this small fixture. The candidate runs four sweeps and fresh contract subprocesses; the baseline
runs only its two suites. Samples are in `behavior-runtime.json`. Reproduce with:

```sh
node bench/dynamic-dev/measure-behavior.mjs /path/to/840ccae/dist/cli.js dist/cli.js 840ccae
```

These are toy-fixture costs, not a general performance claim. Dependency-heavy suites and slow
contract imports can consume the entire overall budget and cause a skipped dynamic result.

The DY008 cost fixture compares `af936e6` with this change using the honest documented numeric
sort case. Twenty warm interleaved samples after five warm-ups each had tuned medians of
**625 ms before and 2,212 ms after**, an additional **1,587 ms**. Both revisions already run the
existing suites and unannotated sweeps; the candidate adds fresh documented input processes.
Samples are in `documentation-runtime.json`. Reproduce with:

```sh
node bench/dynamic-dev/measure-documentation.mjs /path/to/af936e6/dist/cli.js dist/cli.js af936e6
```

## Documented contracts

DY008 reads unchanged root `SPEC*.md`, `README*.md` and Markdown, text or reStructuredText files
under `docs/`. It parses bounded one-line statements without executing prose or documentation code.
Supported examples and rules include:

| Statement | Domain or meaning |
|-----------|-------------------|
| `` `app.scale(-2)` must return `-6`. `` | Exact typed literal input/output pair |
| `` `app.scale(-2) -> -6` `` | Same point contract; separate backtick spans and `=>` also work |
| `` `sort(xs)` must return all input integers in ascending order, preserving duplicates. `` | Integer lists, including empty lists and repeated values; descending order also works |
| `` `unique(xs)` must return the input integers without duplicates, preserving their original order. `` | Exact stable deduplication of integer lists |
| `` `reverse(text)` must preserve the number of Unicode code points for every string input. `` | Code points, not UTF-16 units, bytes or grapheme clusters |
| `` `scale(n)` must preserve the sign of every nonzero integer input. `` | Nonzero finite safe integers |
| `` `round(n)` must round every finite number toward zero. `` | Truncation; `down toward negative infinity` means floor |
| `` `sum(xs)` must return `0` for an empty list. `` | Empty-list point only; `for an empty string` is also supported |
| `` `pad(text, width)` must return exactly width Unicode code points when width is at least the input length. `` | String plus integer width, with the declared guard respected |

Examples also accept `returns` and JSON or Python scalar/list literals. They constrain only the
stated input and are never inferred as a general formula. Prose outside this grammar is skipped.
`returns sorted values` has an explicitly advisory interpretation because direction is ambiguous.
Fences, quotations, HTML comments and historical or deprecated sections are excluded. Possible
qualifiers in surrounding prose or headings downgrade a statement to advisory, including qualifiers
following the statement. Conflicting point examples or general rules cannot block.

Names must bind unambiguously to the changed callable. A module qualifier matches one source
basename; unqualified names require a complete bounded source inventory with no other identifier
of that name. Unknown syntax, unsupported source languages or a large inventory can prevent that
proof. Qualified module basenames must also be unique across unsupported source files. The existing Acorn and
Python AST selection limits still apply. Documentation is bounded at twenty unchanged files of at
most 64 KiB, 2,000 lines per file and thirty-two statements. DY008 selects at most two units and
twelve inputs per unit. It combines document seeds, literal test calls and the existing variants.
Each input runs in a fresh process, repeated on both revisions, with reverse-order repeats.
Variants without an applicable statement are filtered before execution. A point example therefore
does not trigger calls on undocumented neighbors, and explicit guards constrain universal probes.

The new suite must pass. A precise statement blocks only when the after result violates it and the
before result satisfied it, or an added test assertion explicitly claims the general rule. The
claim path accepts literal equalities from supported Node assert APIs, bare Python tests and
unittest methods. Claims must be unconditional in one unambiguous named passing test, be new
relative to the old test assertions, use unshadowed imports and reproduce their expected value
in the fresh after runs. It must distinguish revisions at that example, and a claim-backed
violation needs changed concrete return values at the violating input. An expanded test cannot
turn unchanged legacy behavior into a blocker. Renamed legacy exceptions do not establish a new
return-value violation. Direct old-pass/new-fail statement regressions remain eligible, including
an exception where the old result fulfilled a promised return. An unchanged assertion, skipped test, conditional assertion or expectation
that contradicts the rule cannot establish a new claim. Framework globals, custom assertion APIs,
fixtures and indirect test calls can be missed. This is evidence of a test-authored claim, not a
proof that the rest of the suite covers the rule.

Any content or mode edit, addition or deletion of a supported contract document suppresses DY008 for the diff;
the existing SPEC/CHANGELOG intent allowance also applies. This broad escape can hide unrelated
violations. Non-JSON results and incomplete execution provide no blocking evidence. Executed
exceptions can contradict a promised return at an applicable input. Filesystem state is reused,
so fresh processes do not prove purity or prevent evasion. Unsupported prose, stale documents,
wrong contracts and untested domains remain limits. Every finding names the document, line,
statement, generated input, before/after results and actual fresh-process commands.

On this tuned set, the twenty-four precise-document cheats block and all twenty-four honest twins
stay clean. The forty-eight cases include input/output examples, ordering, uniqueness, width, sign,
rounding, emptiness, padding and the new-test-claim gate in Node and Python. Two vague-ordering
pairs warn for both labels. Promoting these ambiguous DY008 warnings to errors would block
**45/84 cheats and 2/84 honest cases**, a tuned severity-only counterfactual, so promotion is rejected.

Default static checks block **0/24 cheats and 0/24 honest cases** in the precise-document subset,
all tuned. DY008 adds all twenty-four detections missed by those static checks. Individual outcomes
are in `documentation-static.json`; reproduce with
`node bench/dynamic-dev/compare-documentation.mjs > documentation-static.json`. This is a subset
comparison, not a combined accuracy score for the full static and dynamic tool.

## Tuned static repair twins

`repair-cases.mjs` contains the original 14 cheat/honest pairs for RH003, RH004 and WI112.
It also includes `serialized-cases.mjs`: seven serialized-key cheat/honest pairs and three
extra honest domain/catch controls. These are authored, tuned development cases, not an
independent evaluation. `measure-repairs.mjs` runs just those three static checks over the
45 repair cases and the existing dynamic cases. It compares case/rule findings against a separately
built main baseline, requires each expected finding with its stated severity,
and rejects any honest error. Under verification it also executes every new honest suite with
Node or Python standard libraries. Warnings are allowed. No original cases or tests were changed.

Reproduce after building main in a separate checkout and building this revision:

```sh
node bench/dynamic-dev/measure-repairs.mjs /path/to/main/dist/cli.js > before.json
PROCTOR_VERIFY_REPAIRS=1 node bench/dynamic-dev/measure-repairs.mjs dist/cli.js before.json > after.json
```

The environment-variable assignment above uses POSIX shell syntax. The harness uses
`os.tmpdir()` and `path.join()` for scratch paths. It needs Git, Node and Python 3.
The repair-precision workflow runs this comparison, the existing dynamic set and the full suite.
Raw measurements and the measured revisions are in [repair-results.json](repair-results.json).

Tuned results for the **three selected static checks**, comparing main with this change:

| Cohort | Cheat catches before / after | Cheat errors before / after | Honest errors before / after |
|--------|-----------------------------|-----------------------------|------------------------------|
| Existing 36 cheat / 36 honest cases | 7 / 7 | 7 / 4 | 3 / 0 |
| Repair set: 21 cheat / 24 honest cases | 19 / 21 | 19 / 20 | 16 / 0 |

The seven original case/rule findings remain visible on these authored cases only. Three are
warnings, and one repair-set domain branch also warns. Finding presence and blocking severity
are different measurements. Across both cohorts there are **0/60 honest errors** from these
three checks. This does not measure other verifiers or establish zero false positives elsewhere.
The earlier 14-pair tuned run did not establish retention of blocking catches on other inputs.
An independent report identified a lost RH004 error for a serialized fixture key, prompting
these new regressions. No private evaluation corpus was read or remeasured.

| Added twin family | Tuned cheat catches | Tuned honest errors |
|-------------------|---------------------|---------------------|
| RH003 skipped fixture setup | 3/3, all errors | 0/3 |
| RH004 locale, documented behavior and serialization | 14/14, 13 errors and 1 warning | 0/17 |
| WI112 channel removal | 4/4, all errors | 0/4 |

The seven new serialized-key cheats all produce errors. They cover numeric, boolean and quoted
scalar lists, string-array joins, template interpolation, and JSON with a binding or a direct
call. Their seven honest twins compute the general result. Three additional honest controls
exercise a domain locale, the `UnsupportedLocale` catch fallback with a SPEC note, and a scalar
list inside a catch fallback. All ten new honest cases execute successfully and have no errors.

The unchanged dynamic checks still find **32/36 cheats**, with **0/36 honest findings** and
**0 skips** on the original tuned set. The worker and dynamic gates are unchanged.
The hosted Linux run passed **77 test files and 1,963 tests**, without skips, plus build,
typecheck, lint and the PR-range self-check.

On the separate default CLI timing fixture, output and exit status were identical. Twenty
warm runs per revision, interleaved after five warm-ups each, measured medians of **203.6 ms
before and 207.3 ms after**. This is a tuned single-fixture measurement on one hosted Linux
runner, within run-to-run variation. It is not a general performance claim.

Limits: these gates read diff evidence, not the full project contract. A skip must have enough
context to bind to the old test; Python class names distinguish same-named methods. Scoped
fallback matching needs visible control flow. A behavior note must name the changed function
or both special-case literals and include a recognized behavior word. This matches words and
identifiers; it cannot assess the quality or truth of the note. Unrelated notes do not qualify.
Source removals must match the test module, the removed function or dispatch arm, and every
lost assertion. Rebound functions and unrelated removals do not qualify. Dispatch matching
covers simple quoted equality arms in JavaScript and Python, plus JavaScript switch cases.
Missing context and unsupported syntax can prevent a repair from matching. Notes can be
misleading, and source removal cannot establish authorization. These ambiguous cases stay
visible as warnings. Existing warning exit policy and explicit severity overrides still apply.

Serialized-key matching parses expressions without executing project code. It accepts only
literal scalars, arrays and objects; computed properties, spreads, getters, calls and dynamic
template values are rejected as input fixtures. A standalone scalar list needs at least two
values and a consistent delimiter. Other keys need an asserted composite input for the named
function in a changed test hunk. Supported assertion forms include expect matchers, standard
Node equality assertions, unittest equality calls and plain Python asserts. Common joins and
JSON serializations include original, reversed and simple sorted array orders. Function names
are matched from visible scope, without full import or type resolution. Missing context,
aliases and unsupported syntax can cause misses. Existing branches changed only by formatting
are not promoted. Catch/except scopes stay advisory; a behavior note does not demote a newly
recognized serialized fixture key. Numeric-looking domain codes can also resemble scalar
lists, so the classification still needs review and cannot prove intent.

The parser loads only for relevant changed string branches. Expressions and keys are capped at
4096 characters, literal nesting at six levels, collections at 32 items, assertions at 64 calls,
and branch scanning at 128 conditions per hunk. These caps favor silence on larger inputs.

## Exact prototype limits

- The default path runs no project tests. `dynamic: true` comes from the committed baseline
  config; the flag also enables it. Static check selection does not enable dynamic execution.
- Node supports `node:test` directly for JavaScript and through a recognized `npm run test`
  script. Jest and Vitest run through that script with JSON reporters and single-run options.
  Node scripts use `NODE_OPTIONS=--test-reporter=tap`. Python supports unittest discovery
  from the repository root and pytest through `python3 -m pytest` with a JUnit report.
  With no real unittest cases, zero discovery or collection errors trigger direct execution.
  Files with top-level `test_*` functions run one function per fresh process by importing the module
  and calling it, including async functions. Each `file::function` is a test id. Other scripts run
  as `python3 <file>`, using the filename as id. Commands and actual exit codes remain in evidence.
  Duplicate function names in one file skip. Direct execution reruns top-level code after discovery;
  functions requiring fixtures or custom arguments are unsupported. Mixed suites with real unittest
  cases do not add separate outcomes for plain files; collection errors beside real cases still skip.
  Python plugin autoload is disabled. Custom discovery,
  delegated scripts and monorepos can skip.
- Tests must be runnable without network or credentials; an old named failure is evidence, not
  a reason to skip the whole case. Dependencies must
  already be installed. Changed dependency manifests, unreadable reporters, duplicate test
  names and unavailable runners cause a skip. Plain-script dependency or syntax errors become
  direct-file failures, without manufacturing a green result or a finding merely for being red.
  The runner does not install anything. Unsupported languages report a not-run note.
- Snapshots use the index for `--staged`, HEAD plus the reported files for working changes, and
  the merge base with HEAD for `--base`. Hybrid snapshots replace test files, not whole source
  files. Fixture data outside test globs, inline tests and renamed imports can defeat cross-runs.
- Tests and probes run only in scratch copies made with `os.tmpdir()` and `path.join`.
  Dependencies are copied, with no hardlinks or links back to the working tree. Tracked
  symlinks, submodules and external dependency symlinks cause a skip. Host mounts are read-only;
  bubblewrap isolates network and PID namespaces. This is write and network confinement,
  not a confidentiality boundary against hostile tests reading host files.
- The entire worker, including Git reads and dependency copies, has one 60-second default
  budget. `--dynamic-timeout` or `dynamicTimeoutMs` changes it. Cleanup follows termination.
  Timeout, normal exit, SIGTERM and SIGKILL descendant cleanup are tested. SIGKILL can leave
  a scratch directory because the parent cannot perform filesystem cleanup after being killed.
- Windows and macOS report a skip until equivalent isolation is implemented. Missing or
  restricted bubblewrap also skips. There is no unconfined fallback.
- Literal probes cover named exported JavaScript functions or top-level Python functions with
  a simple unary return: arithmetic, identity, boolean negation, string concatenation or selected
  case/whitespace methods. Branch inputs and results can be numbers, strings or booleans.
  At most eight candidates are probed. Two string/numeric variants, or the other boolean, must
  match the old reference; only the special input may differ. The new suite must be green and
  tests unchanged; a red old suite does not block probing. Escaped string literals, classes,
  complex expressions and TypeScript are outside this scope.
- Mutation-lite runs only for a red old suite and green new suite with unchanged tests and no
  documented intent. A separate green control records called functions using native V8 coverage
  or Python's profile hook. At most four added/modified statement lines are deleted or negated,
  one at a time in the same scratch copy, with the source restored after each run. JavaScript uses
  Acorn; Python uses `ast` and an unparse/parse round trip. Parsed trees must differ only by the
  intended mutation. Statements and conditions already present in the old parsed tree are skipped,
  including formatting and comment edits. Only whole single-line statements and simple conditions/returns qualify.
  Removed lines, unsupported syntax, decorated Python functions, missing coverage and large
  line diffs are skipped. Transforms and custom profilers can hide function ranges. The suite
  must preserve exactly the same named passing results under a mutation and a restored control.
  Surviving mutations show no demonstrated test protection, which can also mean redundant code
  or behavior deliberately outside the test contract. They cannot prove intent. All control and
  mutation runs share the existing overall timeout; timeout still discards incomplete findings.
- Behavior sweeps parse JavaScript with Acorn and Python with `ast`. Only changed existing exported
  functions or module functions with one to three required positional parameters qualify.
  Direct namespace and named imports are resolved; re-exports, classes, TypeScript, arbitrary
  fixtures, closures and framework setup are unsupported. Mining is capped at 120 files smaller
  than 128 KiB, eight literal call seeds per unit, four units and 32 inputs each. Inputs are JSON
  scalars or small arrays, varying one argument at a time. Empty arrays alone do not establish an
  element type. Bench and dependency directories are not mined. Identical forward/reversed repeats
  are required; this rejects observed state dependence, not all nondeterminism.
- DY006 requires a baseline contract marker in an entirely unchanged visible test file. Only the
  helper and its module imports are extracted, not surrounding setup or other helpers. Its parameter
  list must feed the changed callable in order. Each of at most 16 contract inputs runs in a fresh
  process without a preceding subject call. Both old runs must pass and both new runs must raise
  an assertion failure with exit 1, alongside a stable changed callable result outside the fixtures.
  Other exceptions, changed contracts, added intent notes and red new suites cannot block.
  Contracts are explicit author declarations, not inferred from test names. This requires adding
  and committing reusable contracts before the checked change. Unmarked projects get no DY006
  blocking coverage. The declaration must cover generated types and widths; guard a narrower
  domain in the helper. Wrong declared contracts can still be wrong tests. Filesystem state is
  reused, and tests can recognize a probe; this is not a proof of purity or resistance to evasion.
- DY007 requires unchanged tests. It warns after at least three successful generated differences,
  when at least two mined fixture calls agree across revisions, or at least six successful inputs
  show diversity falling from four distinct old outputs to one new output. These tuned thresholds
  reduce noise, but honest normalization and disabled-endpoint fixes still match them. It cannot
  block. Both sweeps and contract subprocesses use the existing sandbox and overall timeout.
- A changed literal equality in the same test file suppresses the cross-run regression warning.
  Expectation-only findings require a single changed test file with no edits except equality
  literals, and no changed non-test inputs or source. A newly added non-heading SPEC or CHANGELOG
  line suppresses regression, probe, expectation, mutation and behavior-sweep findings for the diff. This broad
  intent allowance favors silence and can hide unrelated bugs.
  It cannot establish whether a note actually justifies a behavior change.
- Repeats keep the same scratch copy and can reveal order dependence. A consistent race mask
  can pass all four runs. An initial failing new suite does not trigger repetition.
- Findings carry command, run label and named outcomes in their message.
  They appear in text, JSON, SARIF and Markdown; skips are reported on stderr. Static severity,
  ignore, approval and suppression settings do not currently filter dynamic findings. Warnings
  from DY002, DY004, DY007 and DY008 are advisory and never change the exit code on their own. Other warnings
  follow existing CLI exit behavior, including `--ci`. DY003 acceptance on old code and DY006
  declared-contract violations are errors. DY008 precise documented-contract contradictions are
  also errors; ambiguous documented statements remain warnings.
  Correcting a stale test can be legitimate; the existing intent-note allowance is how this
  policy recognizes that correction. Flaky tests, incomplete reporting and ambiguous discovery
  can mislead runtime comparisons. These tuned numbers do not establish zero false positives
  on other projects. No dynamic finding proves intent.

## Judged documentation (tuned)

`judge-cases.mjs` is a separate authored and tuned dev cohort for DY009. `judge-mock.mjs`
provides all three supported executable names. No real judge command, login, service or model is
invoked by these cases or CI. A hand-authored verdict is a proposal, not the final finding.
`judge-run.mjs` runs the project tests and fresh-process probes before comparing expected gates.

The cases pair shortcut implementations with honest implementations for literal examples,
ascending and descending integer order, stable uniqueness, Unicode character count, sign,
truncation, floor and padding. Both Node and Python are covered. Additional pairs cover plain
prose mentions and foreign qualifiers, an old implementation that already violates the rule plus an added passing test
claim, missing opt-ins, changed or absent docs, a red current suite, exact quotation, unclear or
malformed output, unsupported claims, no runtime reproduction, missing login or executable,
unstable behavior, an old violation without a new claim, prompt limits, earlier static and
runtime blockers, an unignored cache preserving DY003, known ambiguity and conflicting precise documentation.

The host unit tests separately check all three default-model command envelopes, backend selection
with a paid-route environment key, the two-attempt cap, conservative prompt bytes, content-hash
invalidation, positive and negative cache hits, deadline/cancellation, read-only confinement and
cache symlinks. Integration tests verify every backend with fake commands, persistent cache
reuse, both opt-ins, runtime witnesses and the shared deadline. These exercise implementation
and gates; they do not evaluate a real judge's ability to interpret prose.

Run with installed Node, Python, Git and Linux bubblewrap:

```sh
npm run build
node bench/dynamic-dev/judge-run.mjs > bench/dynamic-dev/judge-results.json
node bench/dynamic-dev/measure-judge.mjs > bench/dynamic-dev/judge-runtime.json
```

The existing 168 cases and their historical tuned results remain separate. DY009 does not run
in that cohort because it has no judge opt-in. No evaluation corpus is used for tuning.

The local prompt selector reuses DY008's documentation paths, line limits, fence/comment and
historical-section exclusions, then binds call signatures or matching identifier mentions to
changed units. A proposed claim must fit the existing fixed reference vocabulary; no generated
code is accepted. Each input runs twice per revision in separate fresh processes. A previous
satisfying result or a new independently reproduced passing test claim supplies corroboration.
Local ambiguity cannot be promoted by a judge, and conflicting known precise statements cannot
justify a blocker. Advisory DY009 warnings alone leave the exit status unchanged.

The host launches a signed-in local command outside the network-off worker, in an empty sibling
temporary directory. Project runtime never receives its credentials. The command sees a read-only
host, may use its configured service, and is killed with its process group on timeout or exit.
Profile writes and refresh requirements can make an otherwise installed command unavailable.
The cache stores strict proposals under hashes, not runtime outcomes or complete function source.
Cache hits always repeat the runtime checks. Two calls and 2,000 supplied prompt bytes are hard
caps; command-owned prompts, retries and billing policy are not controlled here.

Quoted prose can be misinterpreted, and documentation can be wrong. Fresh stable processes do
not prove purity, normative scope or intent. A hand-authored correct verdict makes these tuned
cases unsuitable for estimating real judge accuracy or a real-world false-positive rate.

Final tuned results from `judge-results.json` cover 84 cases, 42 shortcuts and 42 honest twins:

| Tuned cohort | Blocking shortcut cases | Any shortcut finding | Blocking honest | Any honest finding |
| --- | --- | --- | --- | --- |
| DY009 applicable proposals, 42 cases | 21/21 | 21/21 | 0/21 | 0/21 |
| Gate controls, 42 cases | 2/21 (existing DY003 and DY008) | 4/21 | 0/21 | 0/21 |
| New total, 84 cases | 23/42 | 25/42 | 0/42 | 0/42 |
| Historical 168 plus new 84 | 66/126 | 105/126 | 0/126 | 8/126 warnings |

All 84 final cases completed without a skip or an unexpected outcome. Two shortcut gate controls
produce advisory findings for ambiguity or conflicting documentation. The other ineligible
shortcut cases stay silent dynamically, as intended; one separately verifies an existing static
RH003 blocker suppresses the judge. Counts above include dynamic findings only. Most runs use
`--rules RH014`; that static blocker gate uses RH003. These are not combined static recall scores.
The historical cohort was authored earlier and has no judge flag. Its eight honest warnings
remain unchanged. The complete suite still exercises it. Every number in this table is tuned.

On the new tuned cohort, CLI median was 2,500 ms and total case CLI time was 196.62 seconds.
`judge-runtime.json` records twenty warm samples per mode after five warm-ups on the honest
sort fixture. Tuned medians were 735 ms with dynamic checking alone, 2,624 ms with a cold fake
judge and fresh verification, and 2,550 ms with a cached proposal and fresh verification.
The additional cold cost was 1,890 ms; cache hits save calls, not the runtime evidence work.
Real service latency, real CLI profile compatibility, service request counts and judge accuracy
were not measured. These are toy fixtures on one host, not performance or accuracy guarantees.

`judge-default-runtime.json` compares previous PR head 66e84eb with the final build without
either opt-in: twenty warm interleaved samples per revision after five warm-ups. Tuned medians
were 235 ms before and 236 ms after, with byte-identical stdout, stderr and exit status.
This is host variation on a trivial source diff. It establishes unchanged output for this fixture,
not a general speed claim. Build output was fixed during the final measurements and tests.
