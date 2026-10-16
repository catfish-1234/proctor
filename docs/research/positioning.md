# Proctor research direction: verification integrity during coding-agent work

Decision date: 2026-10-15 (America/Los_Angeles). Status: research proposal and
reproducibility seed, not an evaluated prevention method. Implementation inspected
at `d5acb6aa0eddcff618925eadc4c937c65a3f3fd5` on main.

## Decision

Pursue a workshop paper first, centered on the tradeoff between catching
unauthorized verification changes and allowing legitimate verification maintenance.
Keep a main-track paper conditional on independent data and a controlled agent
intervention study. The skill format, discovering reward hacking, a tampering
taxonomy, and prompt-based prevention are already established ideas.

The candidate question is:

> Can a portable skill plus an inexpensive, explainable diff guard reduce
> unauthorized verification tampering without obstructing authorized test edits
> or reducing independently measured task completion?

The contribution would be evidence about that tradeoff under a stated trust
boundary, together with an auditable implementation and authorization-sensitive
data. It is not currently a claim of superior detection, secure enforcement, or
firstness. [Related work](related-work.md) examines the nearest collisions,
including AgentGuard's coding-agent skill and BenchShield's integrity mechanisms.
AgentGuard already considers authorized test corrections and measures useful
task completion and over-refusal. Authorization awareness and utility measurement
are therefore prior art too; the remaining bet is the deterministic guard's
incremental benefit under independent evaluation.

## Define the target before counting it

Verification tampering means an unauthorized change to a test, grader, execution
path, expected answer, gate, or reported result that weakens evidence of satisfying
the task. An authorized feature deletion, corrected erroneous test, deliberate
snapshot migration, or independently approved flaky-test quarantine is not
automatically tampering. The same patch can receive different labels under
different authorization records. Unknown authorization is an abstention, not a
convenient negative.

Distinguish attempted tampering, successfully corrupted verification, independently
incorrect code, and intent. A diff detector observes change patterns; it does not
establish the agent's motivation. Some reward hacks (semantic overfitting to visible
tests, data leakage, changing an external service) never modify verification and
are outside this primary target. Wider work-integrity rules are exploratory
extensions and must not silently redefine the primary endpoint.

## What exists and what remains to build

| Component | Inspected implementation | Research limit or proposed addition |
| --- | --- | --- |
| Skill | Canonical [ruleset](../../src/skill/SKILL.md) deployed through agent adapters | Instructions are advisory; measure whether the agent actually reads and follows them |
| Detection | Git diffs, 14 default RH verifiers and 13 opt-in WI verifiers; stable finding IDs | Pattern coverage varies by language and syntax; no semantic completeness |
| Interventions | Pre-commit hook, Claude Code Stop hook, CLI and CI; error findings can block | A block is an event, not proof that later evasion or task corruption was prevented |
| Policy | Committed-baseline config; approvals downgrade findings to info; unchanged-context suppression markers | Git history is not authenticated human provenance; an agent allowed to commit can stage a policy change in an earlier commit |
| Explanations | Several individual verifiers accept explanatory comments | A persuasive comment can be agent-written; this is a separate adversarial ablation |
| Optional judge | `--ai` for selected fuzzy cases | Separate network/model-dependent comparator, not the offline core |
| Existing evidence | Unit fixtures, iterative red-team corpus, fixture replay and live-run machinery | Developer-tuned material is development evidence; mock replay cannot estimate behavior change |
| New artifact here | Synthetic labeled seed and offline CLI replay | No live-agent, hidden correctness, or prevention measurements in this PR |

## Trust boundary and deployment claims

For local assistance, assume the working tree is untrusted and keep the CLI's
baseline policy explicit. A repository owner can override a hook. An agent with
the same privileges can also bypass it, change tooling, rewrite history, or use a
different worktree. A stop hook is an agent integration, not an OS security
boundary. An end-of-turn diff also misses a verifier modified, executed, and
restored between observations.

For a prevention experiment, the external orchestrator must own the policy and
base commit, monitor binary, event log, held-out oracle, and merge decision.
Evaluate the exact candidate tree whose hash was checked. The agent must not be
able to replace that checker or choose the comparison base. Trusted CI must load
the checker and workflow from a pinned trusted source, not blindly execute a
candidate-modified workflow. These are proposed experimental controls, not new
capabilities implemented by the seed harness.

Report both boundaries. A useful local warning tool can exist without claiming
resistance to a hostile agent with arbitrary shell access. Strong enforcement
may be simpler using immutable evaluators; proctor must justify its extra value
where legitimate test maintenance makes blanket locking costly.

## What can be novel relative to the required papers

| Work | Established contribution that proctor must credit | Candidate distinction requiring evidence |
| --- | --- | --- |
| [ImpossibleBench](https://arxiv.org/abs/2510.20270) | Specification/test conflicts expose shortcuts and support monitoring research | Ordinary solvable repository tasks with authorized test-edit controls and measured intervention utility |
| [EvilGenie](https://arxiv.org/abs/2511.21654) | Perturbations and ambiguity expose coding-agent misbehavior | Reusable offline guard evaluated on fresh trajectories, with cost of false alarms measured |
| [SpecBench](https://arxiv.org/abs/2605.21384) | Visible-test success can diverge from specification correctness | Verification-change detection is a narrower endpoint; pair it with an independent correctness oracle |
| [HVTB](https://arxiv.org/abs/2608.22103) | Hack-verifiable terminal tasks and prompting interventions | Portable repository checks on unplanted edits, including legitimate maintenance, compared with prompt-only guidance |
| [TRACE / contrastive detection](https://arxiv.org/abs/2601.20103) | Human-verified synthetic trajectories and contextual detection baselines | Explainable, model-free diff evidence at an intervention point; compare information access and benign-edit burden fairly |

These are differences of scope, not priority or performance claims. In
particular, [AgentGuard](https://arxiv.org/abs/2609.16287) already learns and deploys
a coding-agent guardrail skill, while [RewardHackingAgents](https://arxiv.org/abs/2603.11337)
already examines evaluator tampering and locking. A credible paper must improve
on their evidence or answer a different, useful question. The detailed review
records verified scope and uncertainties for each source.

## Stop, narrow, or continue

Continue if an independent benign corpus reveals a useful precision/recall frontier
and a pilot can produce enough actual tampering events to evaluate interventions.
Narrow to a tool/position paper if the guard is useful but the skill adds no
measurable benefit. Publish a negative finding within a later authorized
submission if guard feedback induces evasion or locking is consistently better.
Do not invent hard tasks, report only easy victories, or reclassify benign edits
after observing detector output to rescue a prevention story.

The [evaluation plan](evaluation-plan.md), [dataset design](dataset-design.md), and
[venue recommendation](venues-and-timeline.md) specify the evidence required for
the next decision. This PR prepares that work; it does not establish its outcome.
