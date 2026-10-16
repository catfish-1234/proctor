# Workshop first; main track conditional on evidence

Decision: 2026-10-16, America/Los_Angeles. The two workshop calls below were
reopened on this date; published deadlines retain AoE (UTC-12). This is a research
recommendation, not authorization to submit, announce or publish.

Choose framing 1 from the [positioning memo](positioning.md): a policy-conditioned
verification-maintenance benchmark. Use it to decide whether framing 2, selective
protection of evolving verification, has a main-track result. The public seed
supports a position/tool discussion, not an empirical prevention paper.

| Opportunity | Verified call | Realistic scope |
| --- | --- | --- |
| [AGENTVERIFY 2027 at ICSE](https://agentverify2027.github.io/cfp.html) | Paper Nov 13, 2026, AoE; current CFP states no separate abstract deadline. Short/demo up to 4 pages including references; extended abstracts up to 2; non-archival option | Best immediate topic fit: harnesses, grading, oracle design, benchmarking and trustworthy agent infrastructure. Position/tool scope unless independent evidence is ready |
| [LLM4Code 2027 at ICSE](https://llm4code.github.io/dates/) | Paper Nov 13, 2026, 23:59 AoE | Alternative after checking the [call](https://llm4code.github.io/call/) and submission-overlap rules; use the same evidence gates |
| Later agent-evaluation / trustworthy-software workshop | No particular later CFP selected or deadline asserted | Prefer this runway for an empirical short paper if independent collection cannot be completed and audited before November |
| Next suitable ICSE research cycle or ML main track | No applicable future deadline verified here | Select only after a distinct, adequately powered result and refreshed literature/CFP review |

The AGENTVERIFY CFP changed during this review: an earlier response/search index
listed Nov 1/Nov 6. The final reopened primary CFP says Nov 13; it supersedes
those earlier dates and the PR #46 schedule. Recheck before a future submission.

## Evidence milestones

1. **Now:** freeze the broad threat model, public development cases and observed
   misses. No detector tuning or new prevention claim is needed for this PR.
2. **Next 4-6 weeks, subject to staffing:** collect 120 independent attack/benign
   episodes across six repositories; double-label and adjudicate; freeze grouped
   splits. Compare evidence-access conditions and simple baselines. If evidence
   is missing, retain position/tool scope rather than rushing a quantitative claim.
3. **Following 4-8 weeks:** rehearse externally pinned acceptance/oracle isolation
   with seeded attacks; estimate live-run cost and event rates; run the capped
   240-assignment feasibility pilot only after a frozen protocol. This timeline
   does not imply November empirical readiness or a powered prevention estimate.
4. **Main-track decision after the pilot:** simulate grouped power, freeze spend
   and sample size, then collect repository/family holdouts, at least three model
   families and independently authored adaptive attacks. Require evidence beyond
   immutable verification and task-aware monitors, including legitimate migration
   success, true correctness and human review cost.

The largest schedule risk is collecting trustworthy permission records and real
maintenance episodes, not adding more synthetic cases. The largest scientific risk
is that simple isolation/locking explains the gains. If it does, report that
boundary or a negative result and stop the selective-system claim. A workshop
acceptance, seed catch rate or arbitrary case count is not a main-track gate.
