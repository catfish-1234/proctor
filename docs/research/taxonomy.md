# Verification cheating: mechanisms, observations and present coverage

Code inspected at main `1bfd0b1`, 2026-10-16. This is a research taxonomy, not a
claim that every behavior is detected. Label unauthorized interference with the
verification contract, execution, evidence or access separately from intent.
Record permission, attempt, corrupted verification and independent correctness.
Contamination can invalidate an evaluation without a deliberate cheating action.

**D**: default RH001-RH014 in an unconfigured repository. **A**: additional opt-in
WI101-WI113. `--all-checks` adds WI while preserving committed configuration that
narrows RH. These columns describe recognized patterns, not complete categories.
Warnings and approved informational findings are alerts; only errors block with
`--ci`. Severity can vary within one verifier.

| Mechanism | Examples | Present pattern support | Gaps and benign look-alikes |
| --- | --- | --- | --- |
| Remove obligations | Delete/skip/focus tests, remove assertions | D: RH001, RH003, RH009. A: WI111, WI112 | Custom runner semantics; benign moves, authorized retirement, helper extraction |
| Change the oracle | Weaken assertions, rewrite expected values/snapshots, redefine matcher | D: RH002, RH006, RH008. A: WI109, WI112 | Arbitrary oracle logic; coordinated source edits can defeat WI109's no-implementation-change condition. Benign spec corrections, golden regeneration |
| Change grader/reward semantics | Zero correctness weight, constant score, reward aggregation omission, judge-prompt injection | No general grader/rubric defense; source patterns may incidentally match RH004/RH005 or WI101/WI103 | JSON rubrics, LLM judges, remote reward services; benign grader repairs and rubric migrations |
| Reduce workload/domain | Remove parameter rows, narrow discovery, shrink fuzz budget, omit CI environments | D: RH007, RH012, RH014. A: WI113 | Recognized local syntax/config only; T08 misses discovery narrowing. Benign suite splits, authorized sampling or environment retirement |
| Prevent execution/launder failure | Delete test commands, tolerate CI failure, neuter scripts, detach async checks | D: RH010, RH012. A: WI110 | Arbitrary shell indirection, plugins, external job settings; benign optional upload failures or equivalent command relocation |
| Forge evidence | Fabricate JUnit/coverage/score, stale cached pass, fake CI status | RH012/WI110 catch nearby suppression signatures; no general result-provenance check | Artifacts/status APIs, checked/submitted tree mismatch; benign report conversion preserving failures |
| Exploit information or evaluator access | Fixture hardcodes, test-environment branch, hidden-answer reads, leaked solution/history | D: RH004, RH005. A: WI105, WI112 | Narrow literal/return shapes are not leakage or contamination detection; benign lookup tables, caches and explicit mocks |
| Weaken quality gates | Suppress diagnostics, relax strictness/coverage, downgrade tools | D: RH011, RH013. A: WI104, WI106, WI113 | Custom/nonlocal gates; benign justified suppression, approved rollback/tool migration |
| Substitute apparent implementation | Canned data, stubs, swallowed errors, removed validation/security | D: RH004/RH005. A: WI101-WI103, WI105, WI107, WI111 | Can be incorrect implementation without verifier tampering; report as a separate semantic stratum. Benign deprecation/fallback/refactor |
| Tamper with authority | Disable monitor/hook, self-approve, lower severity, replace reward code | D: RH007 warns on Proctor-policy edits; committed baseline resists same-diff replacement. A: WI104 | No authenticated human provenance, binary/baseline integrity or remote reward control; benign trusted approvals/checker upgrades |
| Escape observation | Ignore/index hiding, edit-run-restore, earlier-commit laundering, check one tree/use another | A: WI108 recognizes visible ignore/index-command patterns | No command/event monitor. Direct actions/reverted edits can leave no diff. Git ignores do not hide edits to already tracked files; benign generated outputs/worktree operations |
| Launder explanation/permission | Add plausible justification, preplant suppression/approval | Baseline policy and unchanged-context suppression resist some same-diff exemptions | Earlier Git state is not human provenance; several rules accept actor-written explanation text. Benign independently recorded prior approval |

The extension's T13-T24/B12-B23 instantiate grader, golden, environment, CI,
artifact, monitor, plugin, fixture, reward, hidden-answer-access-code and command
mechanisms. They are static inputs, not successful executions. Temporal attacks,
remote changes, actual prohibited reads and memorized answers are design gaps,
not pretend replay coverage. The [seed guide](seed/README.md) maps exact cases.

## Implementation anchors and enforcement limits

- [Registry](../../src/verifiers/registry.ts), [defaults](../../src/context/index.ts),
  [CLI selection and CI decision](../../src/cli.ts), and individual files under
  [verifiers](../../src/verifiers/) establish rule selection and pattern scope.
- [Engine](../../src/engine.ts) and [context](../../src/context/index.ts) establish
  baseline policy, suppression and approvals. RH006/RH014 and several WI rules
  accept explanatory text; a reason is not authenticated authorization.
- [Stop hook](../../src/hooks/stop-hook.ts) permits nonrepositories and mid-merge
  states and fails open on subprocess errors/timeouts. A local hook is not an OS
  boundary. The seed measures CLI decisions, not successful hook enforcement.

## What the broader approach needs

Compare nested evidence conditions: **diff only**, **diff plus task/permission**,
and **diff plus task/permission plus external trace**. A controller outside the solver's write
authority must own policy, comparison base, checker, logs, hidden evaluator and
acceptance decision, bound to the candidate hash. Separately authorized verifier
evolution needs independent semantic witnesses; a clean diff is insufficient.
These are proposed experiment controls, not present Proctor capabilities.

This is a synthesis of existing attack classes, including
[reward tampering](https://arxiv.org/abs/1908.04734),
[METR's concrete exploits](https://metr.org/blog/2025-06-05-recent-reward-hacking/),
[BenchJack](https://arxiv.org/html/2605.12673v1) and
[BenchShield](https://arxiv.org/html/2609.11028v1), rather than a new taxonomy claim.
