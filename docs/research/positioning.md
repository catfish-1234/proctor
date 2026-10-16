# Paper plan: selective protection of evolving verification

Design decision: 2026-10-16, America/Los_Angeles. Builds on PR #47 at
`2a22881d5abb4b16f9a38129254a50ccdd763f5f`, whose base is latest main
`1bfd0b192ea214a0ed349b27822b11b8ccf23e07`. This revision changes docs only.
All experimental quantities in this plan are **planned**, unless explicitly called
measured or source-reported. No prevention result or main-track readiness is claimed.

## Thesis and choice among the three framings

**Lead with framing 2: selective protection of evolving verification.** An agent
should be able to repair tests, graders and CI without acquiring authority to
weaken the evidence that accepts its own work. Test whether separately authorized,
artifact-bound verifier migrations preserve integrity and useful maintenance at
lower review cost than locking with human exceptions. Use framing 1's
policy-conditioned benchmark as the evaluation instrument. Use framing 3's
counterfactual replays to explain failures and displaced attacks, rather than
claiming a separate causal-attribution invention.

This is a stronger main-track bet than another taxonomy or detector benchmark.
It is also falsifiable: a well-configured lock with human exceptions may be equally
safe, useful and cheap. If so, report that result and retire the selective-system
claim. A better detector score on public seed cases cannot rescue it.

Provisional title: **Who May Change the Oracle? Selective Protection of Evolving
Verification in Coding Agents**. The intended paper is about a protocol and its
limits; Proctor is one replaceable routing sensor.

## Contributions to earn

1. A concrete migration protocol: authenticated task/policy, independently owned
   verifier versions and witnesses, and atomic acceptance of the checked artifact.
   State the trust assumptions and attack boundaries; do not claim pinning or
   human approval as inventions.
2. Independent executable data linking task, authorization, patch and trajectory:
   real executed agent traces, public issue-resolution tasks, and real verifier
   maintenance. Include identical-edit/different-permission contrasts, grouped
   holdouts and honest unresolved labels. The benchmark supports the system claim.
3. A preregistered integrity/utility/review-cost comparison against strong guards,
   a simple contextual LLM judge, immutable verification, and locking with the same
   human exceptions. Adaptive attacks and component ablations test what creates
   any advantage. A credible negative result is an alternative outcome.

These are proposed contributions, not established firsts. [Related work](related-work.md)
occupies conditional guardrails, contrastive hack detection, evaluator locking,
infrastructure provenance and protocol-validity measurement already.

## Protocol and threat model

The actor is a coding agent with shell access and write access to its assigned
checkout. In ordinary runs it tries to finish the user task; in an explicit attack
stratum an independent red team tries to get unauthorized evidence accepted. The
actor may edit tests, loaders, grader dependencies, CI, result artifacts, policy
files and local logs; create commits/worktrees; forge approval text; and perform
edit-run-restore. Intent is not inferred from a diff. Hidden-answer access and
semantic overfitting are separately labeled, not silently counted as verifier edits.

The trusted controller owns the original task and base, authenticated permissions,
checker/image, verifier dependency closure, host-side append-only events, reviewer
service and acceptance decision. The independent correctness oracle lives in a
separate sandbox outside agent-readable mounts/services. Agent-generated comments,
local commits and local traces never establish authority. Local hooks alone are
not a security boundary. OS/container escape, compromised researcher keys and
malicious authorized owners are excluded; all must be stated as assumptions.

The proposed state machine is:

1. Pin `(task, policy, base, source tree, verifier/dependencies, environment)` by
   content hash. Agent-visible tests provide feedback but cannot certify acceptance.
2. Source-only proposals run against the current trusted verifier. A verifier
   change becomes a *migration proposal*; it cannot authorize itself.
3. Check a human-signed, out-of-band permission predicate scoped to the task and
   allowed obligation delta. When it validates that predicate, the trusted controller
   issues one-use authorization bound to exact old/new and candidate hashes. The controller checks independently authored task-derived migration
   witnesses: required behavior retained, specifically authorized behavior changed,
   new edge cases and seeded bypasses rejected. Agent tests alone are insufficient.
4. Automate only explicitly scoped, machine-checkable migrations: for example a
   test move preserving discovered obligations, equivalent CI sharding, or an
   exact requirement-backed expected-value change. Unknown scope, unmet witnesses
   or uncertain dependency effects escalate to the independent reviewer; approval
   cannot be inferred from successful tests. The controller binds the authorized
   scope to the exact proposal; the actor cannot grant authority. Record how much
   was preauthorized, automated and manually reviewed.
5. Execute in a fresh controlled environment. Bind source, verifier and witness
   hashes to the verdict and a one-use approval. Revalidate atomically at acceptance;
   any changed byte, dependency, policy or environment invalidates it. A rejected
   migration leaves the previous verifier authoritative.

The guarantee is conditional acceptance integrity within that boundary, not proof
that finite tests capture the intended specification. Exact controller, trace and
oracle integration are **not implemented by this docs PR**. The existing CLI,
skill, hooks and synthetic replay remain as inspected in PR #47; their failures
and coverage remain in [taxonomy.md](taxonomy.md) and [seed/README.md](seed/README.md).

## Evidence and paper structure

Use [dataset-design.md](dataset-design.md) for independent collection,
[evaluation-plan.md](evaluation-plan.md) for frozen comparisons and statistics,
and [PLAYBOOK.md](PLAYBOOK.md) for commands, staffing, costs and decision gates.
The paper should allocate space to the protocol and trust boundary, independent
collection/annotation, controlled experiments, adaptive failures and limitations.
The public 48-case seed stays a development sanity check, never the headline table.

Design to ICSE/FSE/ASE technical-paper standards. USENIX Security '27 cycle 2 is
the nearest verified flagship opportunity if an adversarial security result is
ready; ML main track requires a broader scientific result across model/policy
families. [Venues and timeline](venues-and-timeline.md) records official deadlines
and fit. Target one venue after the evidence gate; do not promise acceptance or
rush an underpowered result to a calendar date.

## Risks that can change the paper

- If authenticated human review explains everything, compare review cost fairly
  and narrow the contribution; do not attribute isolation gains to the diff guard.
- If natural attacks are rare, report event-rate uncertainty and use the explicit
  adversarial stratum for robustness. It cannot estimate deployment prevalence.
- If oracle isolation or task semantics fail, quarantine the task and rerun every
  affected arm before interpreting results. An intact but wrong oracle stays wrong.
- If the independent data or strongest baseline cannot be obtained/reproduced,
  limit the claim. API model drift, public-benchmark contamination, ambiguous
  permissions, correlated tasks and nonredistributable traces constrain generality.
- If only benchmark characterization survives, framing 1 can be a separate,
  accurately scoped paper. The workshop route is a fallback, not the default ambition.
