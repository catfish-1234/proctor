# Proctor research package

Decision snapshot: 2026-10-15, based on main
`d5acb6aa0eddcff618925eadc4c937c65a3f3fd5`. This directory prepares a research
direction and an offline development artifact. It does not contain a completed
agent intervention study or a paper submission.

Read in this order:

1. [Positioning memo](positioning.md): the question worth testing, implemented
   capabilities, trust boundary, and limits on novelty claims.
2. [Related work](related-work.md): primary-source review of all five requested
   papers and closer contemporary work, with evidence depth and comparison limits.
3. [Evaluation plan](evaluation-plan.md): hypotheses, independent labels/oracles,
   metrics, baselines, ablations, statistics, and validity threats.
4. [Dataset design](dataset-design.md): authorization-sensitive tampering labels,
   collection, leakage control, hard benign edits, and release protocol.
5. [Seed dataset and offline harness](seed/README.md): reproducible synthetic
   development cases and detector comparisons; no model credentials or fixture
   execution required.
6. [Venues and timeline](venues-and-timeline.md): workshop-first recommendation,
   verified calls and deadlines, prospective milestones and missing main-track evidence.
7. [Validation record](validation.md): actual local checks and seed measurements,
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
