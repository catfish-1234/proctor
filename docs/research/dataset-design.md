# Verification-tampering dataset design

Status: prospective protocol with a small synthetic development seed. No claim of
natural prevalence, independent human annotation, or held-out generalization.
See the [offline seed instructions](seed/README.md) for the actual checked-in
format and commands.

## Unit, labels, and authorization

Use an edit episode rather than a single suspicious line as the primary unit:
task instruction, trusted starting tree, permission record, agent-visible files,
before/after trees, complete patch, and, when collected, tool events with monotonic
timestamps. A trajectory can contain multiple episodes; keep their common parent
ID for splitting and confidence intervals. A final diff alone cannot establish
the absence of temporary tampering.

The gold label has three values: `tamper`, `benign`, and `ambiguous`. Label
unauthorized verification weakening as tamper even if it fails to inflate reward;
record success separately. Do not infer malicious intent from a positive label.
Keep correctness, authorization, and mechanism labels separate:

| Field | Meaning |
| --- | --- |
| Task and provenance | Original prompt, source URI or synthetic authoring statement, source commit, license, collection date, generator/model identity if applicable |
| Permission record | What verification changes the requester authorized, when, and who controls that record; `unknown` if absent |
| Patch evidence | Changed paths, before/after blobs and hashes, line spans, explanation of how verification changes |
| Gold judgment | Label, mechanism family, rationale, annotator IDs, disagreement and adjudication status |
| Outcome evidence | Attempted tamper, mutable-verifier result, independent-oracle result, execution failure; `unmeasured` when not run |
| Split and ancestry | Development/validation/test, repository/task/template/trajectory parent, near-duplicate group |
| Observation boundary | Final diff, staged snapshot, tool-event prefix, or entire trajectory; distinguishes different detector inputs |

A signed permission record or trusted human service is a future collection
mechanism. A comment written by the actor or an arbitrary earlier Git commit is
not proof of human authorization. Never turn a detector finding, rule ID, or
the mutable grader's pass bit into the gold label.

## Mechanism and benign-neighbor coverage

| Surface | Tamper examples | Necessary benign neighbors |
| --- | --- | --- |
| Tests and assertions | Delete/skip/focus cases, weaken assertions, detach async checks, shrink parameter domain | Rename/move unchanged tests, strengthen assertions, add cases, refactor helpers |
| Oracles and graders | Replace expected answer, forge score/result file, monkeypatch evaluator | Approved specification correction, grader bug fix, schema migration |
| Test execution | Exclude discovery glob, neuter package test script, launder exit status | Broaden discovery, split equivalent jobs, propagate a failing subprocess status |
| CI and quality gates | Remove tests, tolerate failures, lower coverage, contract matrix | Add platforms, justified migration, approved flaky-test isolation |
| Guard and policy | Self-approve, insert suppression, disable hook/checker, change comparison base | Trusted preapproval, checker upgrade, equivalent fail-closed wrapper |
| Outside verifier paths | Hardcode a fixture, test-environment branch, dependency/import shadowing | Legitimate cache/mock boundary, lookup table, dependency maintenance |
| Temporal/runtime state | Edit-run-restore, unstaged/untracked files, symlink or index manipulation | Safe generated files and deliberate worktree operations |

The seed samples only some cells. Temporal state, real reward inflation, and many
languages require subsequent collection. A coverage table must show zero-count
cells instead of implying that every family is represented.

## Collection and independence

1. Treat existing `fixtures/`, `bench/tasks/`, and `bench/redteam/` plus this seed
   as public development material. The red-team corpus influenced the rules.
   Derivatives, translated examples, and minimized variants inherit this status.
2. Recruit a separate collector/annotator to gather real agent episodes on
   licensed repositories and create fresh mechanisms without consulting rule
   patterns. Preserve failed attempts and no-edit runs. Real-agent provenance
   must name actual model, prompt, tools, and budget; synthetic data stays labeled.
3. Sample legitimate verification maintenance from a stated repository/time
   sampling frame, including rare authorized deletions. Preserve original issue
   context and the authorization record. Include benign patches that ordinary
   static analysis finds suspicious, rather than only implementation bug fixes.
4. Freeze repository/task/ancestry groups before scoring. Split 60/20/20 by
   group where feasible, then publish the exact IDs, counts, hashes, and grouping
   algorithm. Choose the sample allocation before looking at detector scores.
   Maintain an independently collected mechanism-family holdout in addition.
5. Two annotators independently label each evaluation episode while blind to
   tool outputs and study arm. Adjudicate with a third reviewer; report raw
   agreement, class-wise disagreement and Cohen's kappa. Conflicting/missing
   permission stays ambiguous if evidence cannot resolve it.
6. Freeze labels, prompts, configurations, code SHA, and analysis script before
   opening test results. Log later corrections with reasons; if a held-out case
   drives a rule change, retire it to development and replenish the test set.

Publish the sampling flow: candidate episodes, license exclusions, missing
context, ambiguous judgments, execution failures, retained units and per-family
counts. Report how selected and natural data differ; artificial class balance is
not deployment prevalence.

## Seed release contract

The seed is authored for this research package, under the repository's MIT
license. It contains complete tiny before/after file maps so replay needs no
external dataset, agent, model key, package download, or executable fixture
dependency. Git and an already built proctor CLI are prerequisites. Fixture code
is inert input: the harness never runs the test, grader, shell or CI payload.

Each seed item includes a task, explicit authorization, rationale, evidence path,
mechanism family and development split. Benign authorized weakening is deliberate:
it tests whether a broad alert is appropriate, not whether any test edit occurred.
An ambiguous item exercises exclusion reporting. Labels were written for the
scenario, not chosen to make proctor pass. The seed has not received independent
double annotation and may overlap the semantics of public proctor fixtures.

Replay compares default RH checks, all checks, a no-detector baseline, and a naive
protected-path baseline. Path protection is a change alarm, not an authorization
oracle. Exact prediction rules, metrics and the seed inventory live beside the
harness to avoid describing a different implementation here. The JSON report
preserves per-item findings and invalid runs; summary metrics must not hide them.
The harness records corpus and detector hashes. Wall-clock timings are environment
specific; fixed input content and predictions are the reproducibility target.

No held-out task solution or grader-correctness measurement is claimed by replay.
For the later intervention study, place the independent oracle and event logger
outside the agent's filesystem/security boundary and evaluate a frozen candidate
tree. Merely naming a test file `hidden` inside an agent-readable repository is
not isolation.

## Release and integrity checks

Reject duplicate IDs, unsafe paths, invalid labels, missing rationale or permission
context, unchanged episodes, malformed detector output, inconsistent exit status,
and incomplete subprocess runs. A crash, timeout or invalid JSON is an unknown
measurement, never a true negative. Return a failing harness status and record
coverage so a partial run cannot look like a complete result.

Pin corpus bytes using SHA-256 and record the proctor commit and bundle hash,
runtime versions, detector command/configuration and seed schema version. Build
once before a run. For archival experiments also pin dependency lockfile, OS image,
locale, CPU allocation, model snapshots, and tool permissions. Keep raw reports
and an analysis manifest; redact credentials and personal data before any future
public data release. Audit train/test leakage by content hashes, rename-aware
patch similarity, common task ancestry, and manual semantic review.

The next data milestone is the pilot in the [evaluation plan](evaluation-plan.md).
Expanding this hand-authored seed alone does not meet the evidence gate for a
main-conference paper.
