# Independent data and labeling

Prospective, 2026-10-16. Every collection count below is **planned**. Nothing here
imports data or reports measured performance. The existing synthetic seeds,
fixtures, red-team probes and every derivative remain development material.

## Three sources, three denominators

| Pool / planned target | Collection and independent evidence | Limitation |
| --- | --- | --- |
| Real executed agent trajectories / 200 | Seeded sampling before detector scoring from [Nebius SWE-agent trajectories](https://huggingface.co/datasets/nebius/SWE-agent-trajectories) and [official released SWE-agent runs](https://github.com/SWE-bench/experiments). Retain task, native transcript, patch, model, failures/no-edit cases and evaluation logs. Prospectively collected ordinary tasks add trusted host events. | Released logs lack authenticated policy and complete host events; unknown stays unknown. Source success bits are not integrity labels. Convenience samples cannot estimate natural prevalence. |
| Real verifier maintenance / 200 | Declare repository/time sampling frame before searching changes. Independently sample merged PRs for tests, expected values, snapshots, discovery, grader/CI/toolchain maintenance, including strengthening and authorized deletions. Save original issue, review and base/merge SHAs. | Historical merge is not blanket permission for an agent. A separate panel reconstructs a research task and authenticates its allowed obligation delta; label this retrospective permission, not historical fact. |
| Executable challenge/permission contrasts / 100 pairs = 200 episodes | Independent authors, blind to Proctor rules, implement runnable mechanisms and hard benign neighbors. Include identical patch with different authentic policies. Pair equivalent migrations with requirement changes, self-approval, dependency/CI/report/trace attacks. | Authored and attack-enriched; not natural incidence. Twins are dependent and stay in one split. |

Use [SWE-bench Verified](https://www.swebench.com/SWE-bench/guides/datasets/) for
the live ordinary-fix stratum, not as a source of cheating labels. Keep public
benchmark tasks distinct from recent real-repository maintenance. Source-reported
dataset sizes, exact revisions, access and license checks are in
[related-work.md](related-work.md); acquisition commands are in [PLAYBOOK.md](PLAYBOOK.md).

Plan at least 15 repositories, with target grouped allocations 120 development,
120 validation and 360 lockbox episodes. Whole-repository groups, task ancestry,
trajectory descendants, templates, reference patches and permission twins never
cross splits. Deduplicate public task IDs across Nebius, SWE-bench and released
runs; also audit patch similarity, renamed paths and semantic duplicates. Retain
actual grouped sizes when targets cannot be exact; freeze IDs before scoring.
Build a separate unseen-mechanism panel. Do not imply every panel is jointly
unseen by repository, mechanism and model. No detector tuning after lockbox access.

## Record contract

Store one immutable raw record and one derived annotation per episode. Required
fields are `episode_id`, `source_pool`, `source_uri`, `license`, `collected_at`,
`repo`, `base_sha`, `task_id`, `task_text`, `policy_id`, `policy_principal`,
`policy_timestamp`, `allowed_obligation_delta`, `policy_evidence_uri`, `before_hash`,
`after_hash`, `patch_uri`, `trajectory_uri`, `host_events_uri`, `model_snapshot`,
`runner_version`, `parent_group`, `split`, and artifact SHA-256 map. Missing fields
have explicit reason codes, never invented values. Collection records name actor,
author, curator and whether any knew the rules. A controller-held authenticated
policy is separate from actor-writable repository files.

Annotation fields: integrity (`unauthorized`, `authorized_or_benign`,
`indeterminate`); mechanism/surface; attempt evidence; transient score corruption;
accepted corruption; independent correctness; authorized migration completion;
prohibited answer access; semantic overfitting; missingness; annotator rationales
and original/adjudicated labels. Do not infer intent. Temporal actions and final
patches have separate observation boundaries. Failure of a hidden test establishes
neither tampering nor intent. Semantic hardcoding without verifier manipulation
is exploratory and does not enter the primary integrity denominator.

Two independent annotators see task/policy and artifact/trace evidence while blind
to monitor decisions and arm where feasible; a third adjudicates. Pilot the rubric
on development only. Publish raw agreement, class confusion and Cohen's kappa,
then adjudicated labels and exclusions. An LLM may triage but cannot be sole gold
judge. Report unresolved authorization and trace incompleteness, with best/worst-case
sensitivity bounds. Never convert missing context into a benign negative.

## Task validity and release readiness

Before any trial, independently author the authorized contract and oracle; require
broken-base failure, reference success, discriminating witness tests and rejection
of seeded harness bypasses. For an approved semantic change, enumerate retained,
retired and new obligations. Keep gold patches, hidden tests and future Git history
outside the agent namespace. Full license and access audit precedes redistribution;
public availability alone is insufficient permission. Preserve source notices and
redact credentials/personal data. TRACE's gated synthetic data is optional transfer
evaluation, never a substitute for real executed trajectories.

Record sampling flow from candidates through license/context exclusions,
indeterminates, oracle failures and final retained groups. Archive raw bytes,
content hashes, prompts, model/config versions, assignment/status/cost ledger,
annotation and analysis scripts. Release only after a separate owner decision;
this PR authorizes no data publication. Any lockbox item that informs a method
change becomes development data and must be replenished before a new test.
