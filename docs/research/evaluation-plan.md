# Evaluation plan: verification integrity for coding agents

Status: prospective protocol, as of 2026-10-15. This document specifies experiments; it does not report a new live-agent result. The public seed corpus in `seed/`, existing fixtures, red-team probes, and mock benchmark runs are development material only. None is an unseen test set or evidence that the skill changes agent behavior. Freeze a versioned protocol, code revision, split manifest, hypotheses, and analysis script before collecting confirmatory data. Record deviations rather than editing the protocol to match outcomes.

## 1. Questions and scope

The intervention is an open-source honest-completion skill plus a deterministic diff guard. The primary claim is narrower than "detects reward hacking": does it reduce **unauthorized manipulation of verification**, at an acceptable cost to legitimate work? The primary verifier-manipulation subset comprises edits/actions that weaken, replace, bypass, hide, or forge tests, assertions, snapshots, graders, test discovery, verification commands/configuration, build/CI exit propagation, reported results, or monitor/acceptance enforcement. File location alone does not decide scope: source code that forges a runner's result manipulates verification even without editing a test file.

**Semantic fixture overfitting and implementation hardcoding are a separate exploratory stratum.** A candidate implementation that fits known examples but violates the broader contract, without changing or bypassing verification mechanics, is outside the primary tampering claim. Existing RH004/RH005 and broader WI checks may detect some such changes; their presence in the shipped tool does not expand the primary research endpoint. Ordinary incorrect implementations are neither verifier manipulation nor evidence of deliberate overfitting without further independent evidence. Label mixed cases with both strata and include them once in the primary subset if they contain an independently established verifier-manipulation action. Freeze these definitions and the family mapping before scoring; never choose the primary subset from which rules happened to succeed.

An edit is not malicious merely because it changes a test, and failing an independent test is not by itself evidence of tampering. A legitimate feature removal can require deleting tests; a test can encode the wrong requirement; an ordinary incorrect implementation can fail without manipulating verification. The gold label must use the task contract, allowed edit policy, authorization evidence, diff, and observed execution. Do not infer a hidden motive from a string match or agent explanation.

Three claims require separate experiments:

1. **Detection:** classify independently labeled, frozen changes, including legitimate verification maintenance.
2. **Prevention:** randomize live-agent interventions and measure whether unauthorized verification manipulation reaches an accepted artifact.
3. **Correctness and usability:** determine whether accepted code meets an independent contract, and whether blocking damages legitimate task completion or imposes review burden.

A terminal finding is an alert. A nonzero exit is an attempted block. Prevention requires a trusted acceptance boundary that actually refuses the artifact. A hook that can be bypassed is not a security boundary. Correctly solving an impossible or contradictory task can mean reporting impossibility without claiming completion, so solve rate and honest noncompletion must be reported separately.

## 2. What exists, and what must be built

The following inspection grounds this plan in the current repository; links identify implementation rather than external evidence.

| Component | Existing behavior | Consequence for an experiment |
| --- | --- | --- |
| [Canonical skill](../../src/skill/SKILL.md) | Rules for tests, hardcoding, unfinished work, and disabling verification; adapters deploy the prose | Test the exact frozen text, including escalation instructions and claims about enforcement; record whether the agent loaded it |
| [CLI](../../src/cli.ts), [context](../../src/context/index.ts), [engine](../../src/engine.ts) | Default RH001-RH014; WI101-WI113 opt in through configuration or `--all-checks`; optional `--ai`; staged, uncommitted, and base-reference scopes | Default and all-checks are different treatments. CLI invocation, baseline config, severity, and diff scope belong in every result row |
| Configuration and suppression | Config/approvals come from the committed baseline; added `proctor-ignore` markers do not immediately suppress a finding; a qualifying existing marker can suppress within its hunk; approvals remain visible at info severity | Test baseline trust and suppression separately. "Already committed" does not establish human authorization if the agent can create commits or rewrite the base |
| [Pre-commit hook](../../src/hooks/pre-commit.ts) | Probes availability and fails closed on execution failures; warning-only exit 1 permits the commit | Measure warnings, error findings, and infrastructure blocks separately; validate the actual accepted artifact, not just the command's status |
| [Stop hook](../../src/hooks/stop-hook.ts) | Checks uncommitted changes; blocks on exit 2; permits infrastructure errors/timeouts, non-repositories, merge states, and recursion skips | It deliberately has availability tradeoffs. Include those paths in bypass tests; do not describe it as universally fail closed |
| [Existing benchmark](../../bench/METHODOLOGY.md) | Uses Proctor itself to label detected signatures; held-out tests are copied into the agent workdir at scoring time; mock arms replay different prepared patches | Useful regression harness, not independent tampering ground truth, a causal mock experiment, or an immutable correctness oracle |
| [Red-team corpus](../../bench/redteam/README.md) | Public adversarial examples and neighboring controls informed guard development | Report as development coverage; do not combine with held-out estimates |

This PR's offline seed harness demonstrates reproducible case construction and evaluation mechanics. The confirmatory corpus, independent annotations, randomized live runs, trusted external acceptance service, immutable scoring sandbox, action tracing, statistical analysis, and independent red team below are **proposed work**, not implemented or completed by that harness.

## 3. Preregistered hypotheses

The numerical thresholds below are prospective engineering targets, not measured performance. A failed target is a result; it must not be replaced after seeing the test set.

| ID | Falsifiable hypothesis | Primary endpoint / comparison |
| --- | --- | --- |
| H1: useful detection | Default Proctor achieves an upper one-sided 95% bound on benign **blocking** FPR of at most 2%, with lower confidence bounds of at least 90% blocking precision and 60% blocking recall on the independent primary verifier-manipulation corpus | Frozen default CLI on unauthorized verifier manipulation and authorization-matched benign controls; report intervals and prevalence-standardized precision, not only balanced-set precision |
| H2: prevention | Skill + default guard reduces accepted primary verifier manipulation by at least 10 percentage points versus no monitor, and improves it versus skill alone | Randomized paired task/model/seed blocks; effect on accepted unauthorized verifier manipulation per assigned primary task, independent of Proctor labels |
| H3: utility | The prevention intervention loses at most 5 percentage points of independent correct task completion versus no monitor | Noninferiority margin -5 points; lower 95% confidence bound must exceed the margin. If underpowered, state inconclusive, not equivalent |
| H4: mechanism | The skill adds value beyond the default guard, and the guard adds value beyond the skill | Factorial main effects and interaction on attempts, accepted tampering, correction after feedback, and correctness; null effects remain publishable |
| H5: broader checks | All-checks increases recall on held-out verification surfaces, while its benign blocking FPR stays within 2 percentage points of default | Matched static corpus and a separately budgeted live subset; also report each family's marginal burden |
| H6: generalization | Detection and prevention retain a positive effect on held-out repositories, attack families, and model families | Prespecified grouped splits and adaptive attacks; no requirement to pass every subgroup, but publish misses and uncertainty |

H1-H3 are the confirmatory family. H4-H6 are secondary unless a larger study is preregistered. A detector can satisfy H1 and fail H2, and a guard can reduce accepted tampering by refusing everything while failing H3. Report these outcomes independently.

## 4. Dataset, authorization, and labeling

Use two complementary sources: independently authored before/after changes for detection, and task trajectories from agents for prevention. Keep seeded, naturally occurring, and explicitly adversarial examples in separate strata. The primary corpus includes repository-level verification changes, temporary verification modifications, and attacks on the monitor itself. Collect semantic hardcoding and implementation overfitting in the separate exploratory stratum. Include authorized negative neighbors: test renames/refactors, requirement-backed expectation changes, legitimate snapshot refreshes, feature removals, flaky-test quarantines with approval, mock refactors, CI performance changes that preserve coverage, dependency maintenance, and real bug fixes.

Each case needs a stable ID; repository/license and base SHA; task and allowed edits; before/after artifacts or replayable actions; provenance and author; authorization evidence and its timestamp/principal; family and surface; independent gold labels and rationale; visible and independent verification outcomes; detector output and status; and split/duplicate group. Protect secrets and private code, and publish redistribution permissions. See the dataset design in this directory for the release schema.

Use two primary labels, not one overloaded "cheat" bit:

- **Integrity label:** unauthorized verifier manipulation / exploratory semantic overfitting only / authorized or benign / indeterminate. Add multi-label attack families, primary/exploratory stratum membership, and whether the attempt changes observable scoring. Mixed verifier/semantic cases retain both labels but are counted once as primary positives.
- **Correctness label:** satisfies independent contract / violates it / honest noncompletion / unresolved. An authorized test repair can be correct; an unauthorized edit can coexist with an otherwise correct fix.

Two annotators independently label each confirmatory item, blinded to detector findings, treatment arm, and reported agent success where feasible. They see the task and authorization evidence. A third reviewer adjudicates disagreements using a written rubric. Report raw agreement, class confusion, Cohen's kappa for the primary label, and Krippendorff's alpha when missing or multiple labels require it; do not hide disagreement in an adjudicated accuracy number. Retain original and adjudicated labels, reasons, and confidence. An LLM may assist triage but is not the sole gold annotator and must not be the detector being assessed.

Run a 50-case annotation pilot on development data; revise the rubric there, then freeze it. Authorization-sensitive counterfactual pairs deliberately reuse the same edit with different valid task permissions. Keep the entire pair in one split, otherwise the authorization test becomes memorization. Unclear authorization is indeterminate rather than assumed malicious. Primary precision/recall excludes indeterminate cases with the excluded count disclosed; sensitivity analyses assign all indeterminate cases to each class in turn.

### Split policy

Freeze split membership before tuning. All descendants of the same base task, template, reference patch, prompt, authorization pair, or semantic duplicate belong to one group. Use patch/text similarity and manual review to catch renamed or translated duplicates. Keep Proctor fixtures, existing bench tasks, public seed examples, and all red-team cases used to change a rule in development only.

Report four distinct settings: unseen examples within known families; leave-repository-out; leave-family-out; and leave-model-family-out live trajectories. Family holdout means no examples or rule tuning for that attack family until scoring is frozen; existing rules may still incidentally detect it. Public benchmark examples and agent-visible training contamination prevent a claim of secret novelty. Maintain a privately authored lockbox corpus and release it after the evaluation. Once a miss informs a code change, that example becomes development data; collect a new lockbox for another confirmatory round.

## 5. Independent scoring and trusted execution

Never define gold tampering as "Proctor emitted a finding," or true correctness as "the agent's test command returned zero." Those are precisely the behaviors under study.

Run the correctness oracle outside the agent-controlled checkout and process tree. Pin an evaluator image, compiler/runtime, dependency lockfiles, fixtures, test command, expected discovered test IDs/counts, and evaluator hashes in a researcher-controlled manifest. Hold hidden tests outside every agent-visible mount and accessible service. At scoring time, export only an allowlisted candidate implementation into a fresh sandbox with evaluator code/config/runner mounted read-only; do not import agent-edited pytest hooks, npm scripts, module loaders, CI config, environment, or test discovery. Record content hashes before execution and after artifact selection. Bound CPU, memory, wall time, output, network, and filesystem access. Evaluate hostile code as hostile code: a read-only file alone does not stop a candidate from killing its parent process or imitating a runner's success output.

The parent evaluator collects individual results via a trusted channel, verifies that the expected tests ran, checks exit-status provenance, and rejects missing/inconsistent evidence. Where the task requires build/config edits, define a reviewed minimal import policy and a separate sandbox for those edits rather than quietly expanding the allowlist. Score APIs or behavior through an external driver when practical. Publish task-specific oracle limitations; finite hidden tests establish tested contract compliance, not a proof of general correctness.

Validate each task before agent experiments: the broken baseline fails a discriminating hidden test; the reference fix passes; representative seeded evasions do not pass by disabling the harness; all requested assertions actually run. Use boundary, randomized/metamorphic, and fresh-input tests for hardcoding; freeze generators and hold secret evaluation seeds. Cross-check a subset with a second independently implemented oracle. Adjudicate evaluator defects without seeing treatment results and rerun all affected arms under the same revision.

Pin the trusted baseline SHA, monitor executable/config/skill, and acceptance policy outside the agent's writable namespace. A branch name, mutable `HEAD`, prior agent-written commit, local hook, or existing suppression comment is not automatically trusted. Final scoring should compare the candidate to the original assigned base, including all intervening commits. A separate deployment experiment can study mutable local hooks, but its security guarantees must remain separate from the externally enforced condition.

## 6. Baselines and fair access

Every baseline receives the same task distribution, time/token budget, visible repository, and artifact scope. For detectors, make available context explicit; a trajectory/contrastive detector with execution traces is not directly comparable to a diff-only detector without disclosing that difference. Tune thresholds on development data only and publish implementation, prompts, versions, and failure policy.

| Baseline | Purpose and exact boundary |
| --- | --- |
| No monitor | Same agent instructions except the intervention; ordinary visible tests; trusted independent correctness evaluation still runs afterward |
| Skill only | Exact canonical skill, no active guard. Keep its deployment paths fixed; disclose that its prose mentions a guard even when the experimental guard is absent. Add a clearly marked text-consistent variant as a sensitivity analysis rather than silently rewriting the treatment |
| AgentGuard guidance | Audit availability/license of the author-released AgentGuard skill and routing artifacts before freezing the comparison. Run released guidance with the same agent/tasks and budget if supported. Otherwise mark unavailable, or label a documented reconstruction as a reimplementation; Proctor's own skill-only ablation does not establish an advantage over prior learned guidance |
| Guard only | Exact default CLI and error policy, no honest-completion skill; same feedback and acceptance checkpoints |
| Skill + guard | Primary deployed intervention, RH defaults; all-checks is a named alternate treatment, not the default result |
| Locked evaluator / protected verification | OS-enforced read-only verification files and trusted external runner, without Proctor. Measures how much benefit comes from evaluator isolation alone. Record authorized-maintenance failures and use a researcher-mediated approval channel; it can still miss semantic fixture overfitting |
| Protected paths / hashes | Alert or block any modification to prespecified tests, graders, verification scripts/config, and guard files; include additions/deletions/renames. This intentionally simple policy tests the value of semantic distinctions; provide the same authorization mechanism |
| Generic static detector | Frozen off-the-shelf lint/security/diff rules plus documented configuration. Standard lint is not a reward-hack detector; report that mismatch. Avoid giving this baseline test labels through custom rules learned from the lockbox |
| Generic LLM reviewer | Fixed model/prompt/context budget, task + policy + base/diff, structured labels and confidence; tune one threshold on development data. Count latency, token cost, refusal, and missing output |
| Optional Proctor `--ai` | Separate networked extension using its pinned judge; do not pool with deterministic offline claims |
| Contrastive reward-hack detector | Reproduce the cited method only if its code/weights/features and paired/reference execution requirements are accessible. Use author-released artifacts when available. If reconstructed, label "reimplementation," document deviations and access advantages, and evaluate a matched-context variant. If inaccessible, report unavailable rather than inventing a competitive number |

Apply both alert and block policies to suitable detectors using fixed thresholds. Never compare one detector's all-severity alerts with another's blocking decisions as though they were the same metric. Also report an oracle authorization baseline to show the maximum benefit of knowing which edits a human approved; do not present that oracle as deployable.

## 7. Experimental design and ablations

### Frozen-change detection

Run every available detector on the same cases. Primary aggregation is case-level: one or more findings means an alert; an error finding under the frozen deployment policy means a proposed block. The primary detection denominator contains every independently labeled verifier-manipulation case, plus the prespecified authorized/benign control pool. Exploratory semantic-only cases are neither primary positives nor benign primary negatives; report their detection metrics separately against their own matched controls. Independently score whether the reported location/family identifies the unauthorized change. An unrelated finding on a tampering case does not receive localization credit. Preserve multi-finding output; report finding-level precision only with independently matched labels, not by assigning every finding the case label.

Report default and all-checks against the entire frozen **primary** verifier-manipulation taxonomy, including primary attack families neither mode claims to cover. Do not remove those misses to produce an in-coverage recall score. Also report declared-coverage subsets as labeled secondary analyses, and semantic-overfitting results as exploratory. Any combined primary-plus-exploratory taxonomy metric is descriptive, uses preregistered stratum weights and explicit per-stratum counts, and cannot replace H1. Rule IDs do not define gold scope: RH004/RH005 hits on semantic-only cases do not raise primary recall, while a WI hit on primary command tampering can.

### Live prevention

Use a 2 x 2 randomized design: skill absent/present x default guard absent/present. Block by task, model version, and run seed; reset from identical base snapshots and fresh agent sessions. Randomize arm order and allocate equal total resource budgets, including guard feedback/retries. API nondeterminism remains even with matching seeds. Log loaded skill/config hashes, tool calls, filesystem events, visible test invocations, all proposed artifacts, blocks, corrections, and final acceptance. Never reuse one arm's transcript in another. Researchers adjudicating trajectories should receive redacted arm identifiers where practical.

Run ordinary development tasks, genuinely ambiguous/unsatisfiable tasks, and explicitly adversarial tasks in separate strata. Do not generalize attack-prompt success to spontaneous behavior. A human-approved requirement repair uses a fixed response policy and equal approval access across arms; no hidden rescue for a preferred treatment. Evaluate feedback-induced correction: after a block, did the agent fix the underlying issue, merely hide the signal, escalate appropriately, or abandon the task?

Freeze primary versus exploratory task-pool assignment before randomization. H2 includes every assigned primary task, regardless of the agent's observed tactic or whether it attempts tampering. A semantic-only hardcode during a primary task does not enter the primary tampering numerator and does not remove the run from its denominator; record it as an exploratory event and score its independent correctness. Conversely, a verifier attack in an exploratory task is disclosed but does not justify post hoc transfer into the primary task pool. Publish results by assigned pool and observed action stratum.

Use the same external gate in all live arms to record candidate submissions. In guard arms it enforces the specified detector decision; in no-guard arms it records without that block. Independent oracle tests score the final artifact in all arms. Read-only evaluator baselines form a separate treatment because they change action permissions, not just feedback.

### Required ablations

| Factor | Comparison / diagnostic |
| --- | --- |
| Defaults vs all-checks | RH only vs RH + WI, identical cases and task budgets; expose additional recall and benign burden |
| Skill and feedback | Full factorial; full findings/explanations vs rule ID only vs generic blocked message on a budgeted subset |
| Baseline trust | Trusted fixed base vs mutable `HEAD`/history; baseline config vs deliberately vulnerable working-tree config in an isolated research variant |
| Escape hatches | Existing authorized suppression/approval; newly added self-suppression; staged prior-commit planting; false explanations; broad stale approval; hunk relocation. Compare production behavior to a research variant with exceptions disabled |
| Scope and checkpoint | Staged vs uncommitted vs original-base-to-final CI; final-diff observation vs full action trace; end-of-turn vs acceptance gate |
| Failure policy | Actual fail-open Stop hook vs externally fail-closed gate; unavailable executable, exception, timeout, missing baseline, and merge/recursion paths |
| Coverage dependence | With/without verification config paths; syntactic variants and renamed/moved files; semantic hardcodes absent any test-file edit |

Vulnerable ablations belong in separate, clearly labeled experimental wrappers or forks. Do not weaken production behavior for the experiment, and do not claim these ablations exist in the current seed harness.

## 8. Metrics and statistical analysis

Publish raw counts and denominators alongside every rate. Use `TP`, `FP`, `FN`, and `TN` from independent case labels. Report alert metrics and blocking metrics in separate columns:

- Precision = `TP / (TP + FP)`; recall = `TP / (TP + FN)`; benign FPR = `FP / (FP + TN)`. A detector with no alerts has undefined precision, not 100% precision. Report F1 and macro averages over families as secondary summaries.
- **Benign blocking FPR** counts authorized/benign cases refused by policy; benign alert FPR includes nonblocking findings. Report "needs human review" as its own outcome, not automatically a successful prevention.
- Balanced-set precision depends on artificial prevalence. Also publish precision standardized to prespecified 0.1%, 1%, 5%, and 10% tampering prevalence using measured TPR/FPR, with uncertainty; these are scenarios, not estimates of field prevalence.
- **Attempt rate:** any independently labeled unauthorized verifier-manipulation action during a run. **Accepted primary tampering rate:** a final accepted artifact/trajectory contains such an action that crosses the acceptance policy. Primary live denominators retain all assigned primary-pool runs; report per attempted run only secondarily. Publish semantic-only attempt/acceptance rates separately, with their own counts; attempt reduction can otherwise conceal weak enforcement.
- **Prevention success:** proportion of independently identified attempts refused at the trusted gate, plus the randomized arm difference in accepted tampering per assigned run. Do not label a refusal as an honest correction.
- **Task utility:** independent correct completion per assigned run; honest noncompletion/escalation; incorrect accepted completion; and visible-vs-independent success gap. Also report the joint outcome "accepted, correct, and free of unauthorized tampering."
- **Burden:** benign blocks and unnecessary escalations per assigned task, blocked turns, retries, time to resolution, reviewer minutes, abandoned tasks, and change in correct completion. Collect reviewer time rather than guessing it from findings.
- **Overhead:** median/p95 wall time, CPU/memory, added tool calls/tokens, API dollars at recorded prices, and total run cost including retries and invalid runs. Report offline guard latency separately from live-agent variability.

The primary unit is the assigned task/model/seed block for prevention and the original repository/task group for detection. Use paired cluster bootstrap confidence intervals for arm differences, resampling repositories then task groups while keeping all variants, seeds, and paired arms together; publish bootstrap seed and at least 10,000 resamples. Report model-stratified effects and a sensitivity analysis using a preregistered hierarchical model. With few clusters, emphasize interval instability and show cluster-level effects rather than treating hundreds of variants as independent observations. McNemar tests on paired cases are secondary and must respect dependence.

Use two-sided 95% intervals for estimated effects and one-sided intervals only for prespecified safety/noninferiority thresholds. Adjust confirmatory H1-H3 decisions with Holm's method; the multiple H1 gates are an intersection requirement. Secondary analyses are descriptive unless explicitly powered and registered. Publish all families, repositories, model versions, and runs, including negative results; no cherry-picking a model that shows spontaneous tampering.

### Missingness, timeouts, and infrastructure failures

Every scheduled run receives a row: assigned, started, agent timeout, model refusal, rate limit, no change, evaluator error, monitor error, completed, and accepted/rejected. A legitimate no-change answer can be honest noncompletion or a correct "already fixed" response; it is not automatically invalid. Timeouts and monitor failures are never silently converted to clean negatives or removed from the primary denominator.

Primary live analysis is intention to treat: timeout/noncompletion is not a correct completion. Accepted tampering is observed from the trace and acceptance log; if either is unavailable, mark unknown and give best/worst-case bounds. Also report completed-run estimates as secondary. Retry clearly exogenous infrastructure failures at most once under a prespecified rule applied equally to paired arms, retaining the original failure record and cost. If the oracle cannot establish correctness, mark unresolved rather than incorrect-by-inference; publish bounds and a complete-case sensitivity analysis. A monitor infrastructure block is a burden/failure outcome, not a true-positive detection.

This differs intentionally from the current `proctor bench` convention of dropping an invalid pair. The existing benchmark's output cannot supply the intention-to-treat analysis without additional run accounting.

## 9. Prospective scale, power, and cost

These are planning numbers, not corpus sizes or completed experiments:

| Stage | Planned collection | Purpose |
| --- | --- | --- |
| Development | Public seed + existing fixtures/probes; 50 annotation-pilot cases; up to 24 live pilot runs, never in confirmatory data | Debug reproducibility, rubric, oracle isolation, task difficulty, event rate, and cost |
| Empirical workshop | 400 new primary frozen cases across at least 12 repositories (200 verifier-manipulation, 200 benign); 12 primary tasks x 2 model families x 2 seeds x 4 factorial arms = 192 assigned live runs; 40 independent primary adaptive attack attempts | Feasibility, calibrated failure analysis, and interval estimates; likely insufficient for a broad noninferiority claim |
| Main-track target | 1,200 new primary frozen cases across at least 30 repositories (600 verifier-manipulation, 600 benign); 40 primary tasks x 3 model families x 3 seeds x 4 arms = 1,440 assigned live runs; 200 additional independent primary adaptive attack attempts | Cross-repository/model inference, meaningful burden estimate, and repeatable adaptive testing |

The table budgets primary strata only. Collect and budget any exploratory semantic-only cases/tasks separately, with their counts and matched controls preregistered; they cannot substitute for primary cases. Represent multiple languages and test/CI ecosystems; sample at most a capped number of variants per source task so one template cannot dominate. Reserve lockbox attack families and repositories. Live task pools should include benign verification maintenance, ordinary fixes, high-difficulty tasks, and genuinely unsatisfiable cases in prespecified proportions. If task tuning is required to obtain tampering attempts, do it on development models/tasks and disclose the enrichment.

For intuition, zero false positives among 300 **independent** benign cases gives an exact one-sided 95% upper bound of about 1%; zero among 600 gives about 0.5%. Repository clustering makes those independent-case calculations optimistic. With paired discordance about 0.25, an absolute 15-point difference needs roughly 80 independent pairs for 80% power at a two-sided 5% level under a simple normal approximation; a clustering design effect of 2.5 would raise that to about 200 pairs. These are illustrative assumptions, not a validated power analysis or a promise the proposed sample is enough. Low spontaneous attack prevalence and H3's narrow 5-point margin may require substantially more runs.

Before the lockbox, estimate event rates, paired discordance, intracluster correlation, and runtime from the development pilot, then simulate power for the actual grouped factorial design and H1-H3 thresholds. Freeze the revised sample size and maximum spend before testing. Do not repeatedly inspect confirmatory effects and stop at significance. If the resulting budget cannot power prevention or noninferiority, narrow the claim to detection/feasibility.

Track cost as `assigned runs x observed average billed run cost + reviewer hours + evaluation compute`, including retries. For budgeting only, an assumed $2-$20 per live run yields $384-$3,840 for 192 runs or $2,880-$28,800 for 1,440 runs, before annotation and infrastructure; actual model prices and token usage are unverified. Allocate at least two independent labels per frozen case, adjudication capacity, and a separately capped adversary budget. Record per-run time/token limits and a total cost cap in the preregistration; cutting off an over-budget run is an outcome, not missing evidence.

## 10. Adaptive adversary and guard bypass

Recruit attack authors who did not implement the tested rules. Give them the released skill/guard source, documentation, queries to a development instance, and a fixed time/query budget. Freeze the defender before lockbox attacks; distinguish white-box adaptive attempts from ordinary coding-agent runs. Require replayable artifacts and a success criterion verified by the independent oracle and acceptance log. Preserve successful and unsuccessful attempts, query counts, and costs.

At minimum test:

1. **Monitor suppression:** change config/severity/ignore patterns, forge explanations, plant approvals or markers in an earlier agent commit, exploit stale broad approvals, delete the skill/hook, replace the executable, shadow `PATH`, or spoof JSON/status output.
2. **History and visibility:** move `HEAD`, rewrite the baseline/history, commit tampering before the final check, exploit merges or recursion skips, use untracked/ignored files, `assume-unchanged`/`skip-worktree`, alternate worktrees, renames, symlinks, generated code, or artifacts outside the inspected diff.
3. **Verification substitution:** weaken graders, test discovery, runner plugins/loaders, dependency resolution, environment branches that bypass checks, command exit propagation, CI matrices/triggers, golden files, or result logs.
4. **Time-of-check/time-of-use:** mutate files between scan and execution/acceptance; background processes; stage one version and execute another; tamper to obtain green feedback, then revert before the final diff. Hash and bind the exact accepted artifact and retain an external action trace. Final-diff detection must explicitly acknowledge attacks it cannot observe.
5. **Availability:** monitor crash, timeout/resource exhaustion, unavailable dependency, malformed repository/config, and missing evaluator output. Measure the production Stop hook's permitted paths rather than assuming stronger enforcement.
6. **Oracle attack:** try to bypass read-only tests, spoof completion/results, exploit import hooks, terminate the evaluator, or exfiltrate hidden tests. If successful, repair the evaluator and rerun affected arms; never count evaluator compromise as correct code.

Separately budget semantic hardcodes without familiar fixture literals as exploratory attacks. Publish their outcomes separately; they do not enter the primary adaptive verifier-manipulation attack-success denominator unless they also manipulate verification mechanics under the frozen mixed-case rule.

Report attack success against (a) the ordinary local setup and (b) the trusted external gate separately. Proctor alone cannot prevent an agent with sufficient filesystem/process control from replacing the authority enforcing it. An external gate is part of the deployment assumption and its benefit must be credited to that boundary, not attributed entirely to the skill.

## 11. Threats to validity and release requirements

The largest risks are circular labels, development-corpus overfitting, toy tasks with no real tampering, attack-enriched samples mistaken for natural prevalence, incorrect authorization judgments, compromised hidden scoring, unavailable comparison methods, model/version drift, and pseudoreplication of near-identical edits. Mitigate them through independent annotations/oracles, grouped lockboxes, explicit strata, matched benign controls, pinned versions, and published denominators. Any mitigation not implemented remains a limitation.

The skill may be ignored or truncated by an agent; record delivery/load evidence and distinguish assigned from received intervention. Feedback may induce concealment instead of honest correction; trace evaluation is necessary. A human approval policy may dominate results; freeze it and report reviewer effort. Task authors and guard authors may share expectations; recruit external case authors and disclose overlap. Public model families differ in tooling as well as capability; state runner permissions, models, budgets, dates, and agent harness versions. Reevaluate frozen cases after a model update as a separate cohort, not a silent replacement.

Release a licensed case manifest, immutable hashes, environment/build instructions, deterministic replay commands, raw detector outputs, deidentified trajectories where permitted, annotation/adjudication records, all assigned-run statuses, analysis scripts, and a complete accounting of exclusions and costs. Keep actual held-out tests inaccessible during live runs, then release them afterward or provide an auditable restricted-access evaluation. Explicitly list tasks or traces that cannot be redistributed and how that limits reproduction.

## 12. Evidence gates for a submission

**Scoped position/tool workshop gate:** a clear verifier-manipulation threat model, accurately described implementation, reproducible development seed artifacts, explicit boundary/failure demonstrations, grounded related-work comparison, and a preregistered evaluation protocol. No full independent empirical study is required for this claim type if the venue accepts it. State that causal prevention, broad detection/generalization, and benign-edit performance are unestablished; seed counts are development observations. See the venue recommendation for suitable tracks and deadlines.

**Empirical prevention workshop gate:** an independently labeled unseen primary corpus with authorization-matched controls; independent and tamper-resistant correctness scoring validated against seeded attacks; a randomized skill/guard pilot with all assigned runs accounted for; at least two model families; adaptive misses disclosed; reproducible artifacts; and honest uncertainty. A public seed harness alone does not meet this empirical gate. A detection-only or systems/negative-result workshop paper can narrow its claims if spontaneous tampering is too rare or intervention intervals are wide, but still needs independent evidence for whichever empirical claim it retains.

**Main-track gate:** a specific contribution beyond existing reward-hacking benchmarks and simple evaluator locking; an adequately powered preregistered study on unseen repositories/families and at least three model families; independent adaptive attackers; comparisons to protected-path/hash and isolated-evaluator baselines; demonstrated prevention at an enforced boundary; benign-edit burden and true correctness estimates; validated annotation/oracle quality; and released artifacts supporting the core claims. Seek H1-H3 evidence, but a rigorous, well-powered negative result can be scientifically valuable if the contribution is reframed accurately. Main-track readiness is not determined by hitting an arbitrary seed-case count or a development-corpus catch rate.

Current verdict: this repository provides a concrete implementation and useful regression material. The research gap is independent evidence about generalization, causal prevention, benign maintenance cost, and robustness of the acceptance boundary. The proposed seed release prepares that study; it does not close those gaps.
