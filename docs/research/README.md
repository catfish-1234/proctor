# Proctor research package

Decision snapshot: 2026-10-16, based on latest main
`1bfd0b192ea214a0ed349b27822b11b8ccf23e07` (including PR #46). The direction is
**authorization-aware verification integrity** across tests, graders, benchmarks,
CI, result evidence and reward channels. Current Proctor is one diff-based sensor;
the broader prevention protocol is proposed research, not an implemented system.

Read in this order:

1. [Three paper framings and recommendation](positioning.md): permission-conditioned
   benchmark first, selective protection of evolving verification second, causal
   attribution as an alternative; theses, novelty boundaries, experiments and risks.
2. [Related work](related-work.md): verified primary sources and close collisions,
   including the two AgentGuard papers and SWE-bench leakage/contamination studies.
3. [Taxonomy and current coverage](taxonomy.md): behaviors, rule IDs, benign neighbors,
   evidence gaps and enforcement limits.
4. [Evaluation plan](evaluation-plan.md): hypotheses, independent labels/oracles,
   metrics, baselines, ablations, statistics, and validity threats.
5. [Dataset design](dataset-design.md): authorization-sensitive tampering labels,
   collection, leakage control, hard benign edits, and release protocol.
6. [Seed dataset and offline harness](seed/README.md): original 24 cases plus a
   separate 48-case extended development corpus with benign look-alikes; unchanged
   harness and detector, no fixture execution or model credentials.
7. [Venues and timeline](venues-and-timeline.md): workshop-first recommendation,
   verified calls and deadlines, prospective milestones and missing main-track evidence.
8. [Validation record](validation.md): actual local checks and seed measurements,
   kept separate from proposed experiments.

The honest verdict is **workshop/position-or-tool scope first**. A main-track
claim needs independent data, strong comparisons, useful uncertainty bounds,
controlled live-agent trials, and evidence of generalization and utility.
Instructions, detection and evaluator protection already have substantial prior
art. No clean diff, mock replay, or hand-authored seed score certifies honest
completion or demonstrates causal prevention.

The existing [architecture notes](../../RESEARCH.md) remain useful for the code
structure. Use this dated package for current literature positioning and planned
research claims; earlier product descriptions are not empirical guarantees.
