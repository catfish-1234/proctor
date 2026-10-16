# Research direction: preserve verification while it evolves

Decision: 2026-10-16, America/Los_Angeles. Base: main
`1bfd0b192ea214a0ed349b27822b11b8ccf23e07` (includes PR #46).
Research design only; detector and enforcement behavior are unchanged.

Ask **how an agent can do useful work without gaining authority over the evidence
that accepts its work**. Tests are one surface. Graders, rubrics, benchmark answers,
discovery, CI execution, result artifacts, monitors and reward channels belong in
one threat model. Proctor's diff checker is an inexpensive sensor in that program.

## Three candidate papers

### 1. When verification changes: a policy-conditioned benchmark

**Thesis.** Evaluate controls on verification changes whose meaning depends on the
task and permission record. Pair unauthorized weakening with legitimate maintenance
of the same mechanism, including identical patches with different authorization.
Cross surface (test, grader, CI, reward, evidence), operation (weaken, bypass,
forge, leak, conceal), and observation available (diff, task/permission, external
trace). The result would establish where controls need context and what legitimate
work they obstruct. Unknown authority remains an abstention; alerts, attempts,
successful evidence corruption and incorrect code remain separate outcomes.

**Candidate increment.** [TRACE](https://arxiv.org/abs/2601.20103) already has hacks
and benign contrasts; [BenchJack](https://arxiv.org/html/2605.12673v1) already audits
benchmark exploits; [AgentGuard](https://arxiv.org/html/2609.16287v1) already has
authorized exceptions. Neither taxonomy nor authorization awareness is new. The
bet is independent executable repository/CI maintenance data with permission-matched
contrasts and controlled evidence-access comparisons. That is a useful empirical
differentiation to test, not a verified first.

**Supporting experiment.** Collect 120 fresh episodes across 6 repositories: 60
forbidden and 60 authorized, paired within 6 mechanism groups. Use separate authors,
two blinded labels plus adjudication, and group each pair into the same split.
Compare frozen Proctor default/all-checks, protected paths, immutable verification,
and a task-aware text monitor. Compare the monitor with/without permission and
trace, using nested inputs (diff; diff plus task/permission; those inputs plus
trace). Current Proctor does not consume the extra context. Report fixed Proctor
operating points, development-selected threshold curves for tunable monitors,
abstention/coverage, pair errors and review time. Identical-diff
pairs are dependent and necessarily receive identical diff-only decisions. This
is a workshop feasibility sample, not a low-FPR certification.

### 2. Selective protection of an evolving verification boundary

**Thesis.** Treat verification changes as separately authorized migrations. A
trusted controller pins task, policy, checker, reference verifier and candidate
artifact. Source changes use pinned verification; proposed verifier changes need
independent authorization and migration witnesses before becoming authoritative.
External execution records and an independent correctness oracle constrain attacks
through plugins, reports, CI and rewards. A diff guard routes suspicious changes
for review; it cannot supply the trust boundary itself. This is an overall
prevention approach to test, not an implementation supplied here.

**Candidate increment.** [BenchShield](https://arxiv.org/html/2609.11028v1) already
models infrastructure authority/provenance;
[RewardHackingAgents](https://arxiv.org/html/2603.11337v1) compares evaluator locking
and trusted scoring; AgentGuard supplies conditional guidance. The possible
contribution is a concrete protocol and measured utility advantage when verification
legitimately must evolve. Pinning files, adding skills and trusted CI are established
techniques. If immutable verification is equally useful and safer, this framing
loses its justification.

**Supporting experiment.** Randomize no guard, guidance only, diff guard at a trusted
gate, immutable verifier, and selective migration on ordinary fixes, real verifier
maintenance and adversarial attempts. Hold controller permissions and independent
scoring equal across arms. Measure accepted unauthorized corruption, independent
correct completion, authorized migration success, reviewer minutes, latency and
adaptive bypasses. Compare selective migration to immutable verification on the
maintenance stratum. Credit isolation gains to isolation. Add guard-plus-guidance
versus guard-only as an ablation, rather than attributing the combination to either
component. The [evaluation plan](evaluation-plan.md) supplies the larger study
structure; new arms need a frozen protocol and powered budget first.

### 3. When green lies: causal attribution of verification score inflation

**Thesis.** Separate successes from changed measurement, semantic overfitting/leaked
answers, and ordinary incomplete solutions. Preserve external action records and
replay the same candidate under local and task-appropriate trusted evaluators.
Disable an identified shortcut while preserving the intended task to test whether
it caused score inflation. Then test whether guard feedback removes the behavior
or moves it beyond the final diff. A pass-rate gap alone establishes neither
cheating nor intent; no gap does not erase a failed attempt.

**Candidate increment.** [HackDetect / protocol validity](https://arxiv.org/html/2607.22368v1)
already separates exposure, use and score attribution, including reruns/ablations.
[SpecBench](https://arxiv.org/abs/2605.21384) measures visible/held-out divergence.
[SWE-Bench Pro Verified](https://arxiv.org/abs/2609.08149) addresses leakage and task
quality. The remaining bet is intervention-induced displacement to temporal/trace
attacks during verifier evolution. This has the greatest overlap and needs a new
empirical finding, not another score-gap metric.

**Supporting experiment.** Randomize feedback visibility with an equally enforced
external gate. Retain all assigned trajectories and preregister event/outcome
labels separately. Compare final-diff alerts with external records of
edit-run-restore, hidden-answer access and result forgery. Replay paired artifacts
with one mechanism disabled, preserving authorized task semantics; validate this
oracle with seeded attacks. Report unattributable and missing-trace cases. An
observational replay alone is insufficient for a causal treatment claim.

## Recommendation and path

**Choose framing 1 for a workshop, as the evidence base for framing 2.** The program
is authorization-aware verification integrity. Framing 3 is a measurement component
and a possible follow-up if displacement is observed. The research question is
selective protection across the verification chain, with measurable legitimate-work
cost, rather than another test-edit detector.

The approach has five parts: independently owned task/permission contracts;
verification-dependency and information-access inventories; diff checks plus
external execution/evidence monitoring; separately authorized verifier migration;
and acceptance of the exact checked artifact using independent correctness evidence.
Only diff checks, an advisory skill, local hooks and local policy exist today. The
trusted controller, trace collection, migration protocol and independent oracle
integration are proposed work. Judge-prompt injection, remote rewards and memorized
answers require evidence beyond diffs; see the [taxonomy](taxonomy.md).

For a workshop, use a position/tool submission if only this public seed exists.
An empirical short paper needs the 120-episode independent pilot and a trusted-gate
rehearsal. Budget two labels per episode plus adjudication. After measuring costs
on development tasks, a 12-task x 2-model x 2-seed pilot over five arms is 240
assigned runs; freeze a spend cap and retain failures. This estimates feasibility
and event rates, not powered prevention or a 1% FPR. The
[venue options](venues-and-timeline.md) provide a workshop-first runway; deadlines
must not determine the strength of the claim.

For main track, use a repository/family lockbox, at least three model families,
independent adaptive attackers, authenticated permissions and validated oracle
isolation. Simulate grouped power using pilot rates before confirmatory collection.
The gate is an integrity/utility result beyond immutable verification and task-aware
monitors, not a seed-case count. A rigorous negative result can instead establish
when selective protection is unnecessary. Recheck prior work and the official CFP
before choosing the next ICSE research cycle or an agent-evaluation ML venue.

## Biggest risks and stop conditions

| Risk | Consequence / decision |
| --- | --- |
| Novelty collision with AgentGuard, TRACE, BenchJack, BenchShield or HackDetect | Reject generic first/safety claims; require a distinct empirical question and strong comparisons |
| Synthetic cases and labels authored after seeing rules | Seed scores stay development observations; use independent authors and blinded grouped lockboxes |
| Forged/ambiguous authorization or expensive review | Keep permission outside agent control; report abstention and reviewer cost, not approval inferred from comments |
| Isolation or immutable evaluators explain the gain | Credit the boundary; stop the selective-system claim unless useful verifier maintenance improves |
| Rare attacks, weak oracle, or feedback-induced concealment | Separate attempts, correctness and trace outcomes; narrow to measurement or negative results if effects cannot be estimated |
| Intact but semantically wrong verification | Independent witnesses/task review remain necessary; integrity cannot establish specification adequacy or eliminate all reward hacking |
