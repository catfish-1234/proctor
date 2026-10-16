# Venue decision and evidence timeline

As of 2026-10-15, America/Los_Angeles. Dates below were checked on primary
conference/organizer pages on that date. Conference deadlines retain their
published timezone (usually Anywhere on Earth, UTC-12); internal work milestones
are Los Angeles dates. Recheck the selected call before a future submission.

## Recommendation

Aim first for a workshop short/tool or position paper. The current artifact is a
research plan plus an offline development benchmark. It is not a main-track
empirical result and is not yet evidence that proctor prevents real-agent reward
hacking. The closest prior work already covers coding-agent skills, tampering
benchmarks, learned detection and evaluator integrity. Packaging alone is weak
novelty; a measured benign-maintenance/prevention tradeoff is the research bet.

| Candidate | Verified date/status | Recommendation and fit |
| --- | --- | --- |
| [AGENTVERIFY 2027, ICSE workshop](https://agentverify2027.github.io/cfp.html) | Abstract Nov 1, 2026; paper Nov 6, 2026, AoE; short/demo up to 4 pages including references | Best immediate fit: skills, harnesses, grading and trustworthy software-agent infrastructure. A non-archival option is available. Submit a scoped position/tool paper only if the artifact and evidence audit are complete |
| [LLM4Code 2027, ICSE workshop](https://llm4code.github.io/dates/) | Paper Nov 13, 2026, 23:59 AoE | Alternative rather than simultaneous submission. [Call](https://llm4code.github.io/call/) includes position papers (1-4 pages) and short/extended work (1-5); also provides a non-archival option |
| [ICLR 2027 workshops](https://iclr.cc/Conferences/2027/CallForWorkshops) | Workshop decisions Nov 29, 2026; suggested contribution date Feb 1, 2027 | Better runway for a pilot. A specific accepted safety/agent-evaluation workshop and its actual deadline remain unverified; Feb 1 is guidance, not an accepted workshop's binding deadline |
| [ICLR 2027 main](https://iclr.cc/Conferences/2027/CallForPapers) | Paper deadline Sep 25, 2026, AoE, already passed | Not an available fresh submission target |
| [ICSE 2027 research](https://conf.researchr.org/track/icse-2027/icse-2027-research-track) | Single cycle; paper deadline June 30, 2026, AoE, already passed | Strong eventual software-engineering fit, but this edition is closed to a new research submission |
| [NeurIPS 2026](https://neurips.cc/Conferences/2026/Dates) | Main deadline May 6; suggested workshop contributions Aug 29; mandatory workshop notifications Sep 29, 2026 | Not a sensible new-paper target now; do not assume a late workshop slot |
| ICML 2027 / NeurIPS 2027 main / next ICSE research cycle | No applicable submission deadline verified in this review; [ICML future meetings](https://icml.cc/Conferences/FutureMeetings) is not a CFP | Conditional later targets. Verify official calls when available; historical annual cadence is not a deadline |

Source caveat: the ICLR 2027 workshop call contains an apparent stale event-date
sentence referring to April 2026. The table uses its explicit 2026-2027 application
timeline only and does not rely on that sentence for conference logistics.

## Work plan and decision gates

| Internal target | Deliverable / gate | If the gate fails |
| --- | --- | --- |
| Oct 15-22, 2026 | Audit primary citations, freeze threat model, run offline seed, enumerate blind spots and independent collection owners | Keep the document as an agenda; no quantitative prevention abstract |
| Oct 23-30 | Separate collector pilot: representative authorized edits plus fresh tampering episodes, double annotation, external-oracle rehearsal, preregister comparisons and costs | AGENTVERIFY can still receive a position/tool paper explicitly limited to engineering and failure analysis |
| Oct 30 | Decide AGENTVERIFY submission scope and archival/non-archival option; check anonymity, artifact access, author/AI disclosure and registration requirements | Choose the later ICLR-workshop runway; do not rush an empirical claim |
| Nov 1 / Nov 6 | Potential abstract/paper to AGENTVERIFY if ready; these are external AoE deadlines | Nov 13 LLM4Code is an alternative only if no conflicting submission/review; follow both venues' policies |
| Nov 2026-Jan 2027 | Collect independent test set, run paired multi-model trials and adaptive attacks, release a reproducible analysis draft within a later authorized workflow | Report insufficient events or negative results; do not turn mock replays into treatment evidence |
| Nov 30-Dec 7 | Inspect accepted ICLR workshops and select a specific CFP with verified scope/deadline | No presumed workshop acceptance or invented venue name |
| Jan 15, 2027 | Empirical workshop readiness decision, two weeks before the suggested Feb 1 window | Submit a position paper if permitted, or wait |
| Feb-Mar 2027 | Main-track readiness review after pilot, independent data and intervention results | Continue tool research or broaden collection; do not select a deadline as a substitute for evidence |

These are proposed work milestones, not experiments performed or scheduled by
this PR. No submission, announcement, or publication is authorized by the research
recommendation itself.

## Evidence needed for a stronger paper

A workshop position/tool contribution can honestly describe the threat boundary,
artifact, reproducible seed, failures and an actionable evaluation protocol. If
it claims an empirical detector improvement, it additionally needs independently
labeled held-out edits and a fair baseline comparison; a small pilot must retain
its uncertainty and sampling limits.

A main-track paper needs a sharper result: independent multi-repository data,
enough positive events for useful uncertainty bounds, realistic benign-edit
sampling, task/model/family transfer, strong static and learned baselines,
matched agent intervention arms, externally scored correctness, adaptive evasion,
and cost/latency/maintainer-burden analysis. Measure skill plus guard against
guard alone and immutable verification, not just against an unprotected agent.
The [evaluation plan](evaluation-plan.md) makes the prospective thresholds explicit.

Missing now: independently annotated test set, live-agent causal evidence,
independent hidden correctness execution, robust external enforcement integration,
adaptive attack evaluation, deployment-prevalence estimates, and a demonstrated
advantage over the closest contemporary work. The seed is intentionally too small
and public to fill these gaps. A workshop-first verdict is a fit judgment, not an
acceptance prediction.
