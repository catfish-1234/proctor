# Related work and novelty boundaries

Checked 2026-10-16, America/Los_Angeles. Targeted primary-source review, not a
systematic survey or reproduction. Search results were discovery aids; the links
below were opened. **A** means metadata/abstract inspected; **F** means relevant
full-text sections inspected; **R** means an original report, not a controlled
peer-reviewed comparison. Absence from reviewed sections is not proof of novelty.
The [three framings](positioning.md) make conditional research bets from this review.

## Foundations and closest collisions

| Verified source | Evidence inspected / supported claim | Implication |
| --- | --- | --- |
| Everitt, Hutter, Kumar and Krakovna, [Reward Tampering Problems and Solutions in Reinforcement Learning: A Causal Influence Diagram Perspective](https://arxiv.org/abs/1908.04734v5), 2019/2021 | A: reward-function versus reward-input tampering and causal incentive analysis | The broad problem and causal framing are established; a repository control is an implementation/measurement contribution |
| Krakovna et al., [Specification gaming: the flip side of AI ingenuity](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/), 2020-04-21 | R: optimizing the literal objective can miss the intended outcome | Semantic gaming need not alter verification machinery; keep this separate from observed policy violations |
| Skalse et al., [Defining and Characterizing Reward Hacking](https://arxiv.org/abs/2209.13085v2), 2022/2025 | A: formal proxy/true reward divergence | A suspicious diff is not a formal proof of reward hacking or intent |
| Dai and Wang, [AgentGuard: Learning Execution Guardrails from Anomalous Coding-Agent Trajectories](https://arxiv.org/html/2609.16287v1), 2026-09-14 | F, method/experiments: conditional instruction guardrails, test/validation/reporting concerns and authorized exceptions; does not intercept actions or change permissions | A coding-agent skill, authorized exceptions and useful-work measurement are already occupied. Test the incremental value of deterministic evidence and enforcement |
| Koohestani, [AgentGuard: Runtime Verification of AI Agents](https://arxiv.org/abs/2509.23864), 2025-09-28 | A plus full-text background: runtime I/O abstraction, online MDP learning and probabilistic checking | A separate same-name paper; do not attribute Dai/Wang's coding skill to it or equate diff patterns with probabilistic verification |
| Deshpande, Kannappan and Qian, [Benchmarking Reward Hack Detection in Code Environments via Contrastive Analysis](https://arxiv.org/abs/2601.20103v1), 2026-01-27 | A refreshed; TRACE has synthetic human-verified trajectories and benign/hacked contrastive detection | Taxonomies, benign contrasts and detection benchmarks are prior art. New evidence must address deployment/permission-conditioned maintenance |
| Wang et al., [Do Androids Dream of Breaking the Game? Systematically Auditing AI Agent Benchmarks with BenchJack](https://arxiv.org/html/2605.12673v1), 2026-05-12 | F, introduction: broad exploit taxonomy, automated red-teaming and iterative benchmark patching | No first general anti-cheating audit claim; deliberate exploit discovery is not a natural behavior rate |
| Zheng et al., [BenchShield: Formal Model-Backed Instrumentation for Reward Integrity in LLM-Agent Evaluation Infrastructure](https://arxiv.org/html/2609.11028v1), 2026-09-10 | F, sections 1-4: lifecycle/authority model, phase-aware static taint and infrastructure runtime evidence, provenance and failure boundaries | Trust boundaries and evidence-backed integrity are not new. Framing 2 needs a measured advantage for legitimate verifier evolution |
| Shao et al., [Do Agent Benchmarks Measure Capability? Protocol Validity in the Age of Agentic AI](https://arxiv.org/html/2607.22368v1), 2026-07-24 | F, sections 1-5/limitations: HackDetect separates exposure, use and score attribution; score gaps, paired reruns and ablations | Framing 3 overlaps strongly; a new metric/replay alone is insufficient. Need task-preserving randomized interventions or a distinct displacement result |
| Atinafu and Cohen, [RewardHackingAgents: Benchmarking Evaluation Integrity for LLM ML-Engineering Agents](https://arxiv.org/abs/2603.11337v1), 2026-03-11 | A refreshed: tracks patches/access, compares reported metrics with trusted references, tests locking and access restrictions | Immutable evaluators and trusted recomputation are baselines, not proctor inventions |
| Thaman, [Reward Hacking Benchmark: Measuring Exploits in LLM Agents with Tool Use](https://arxiv.org/html/2605.02964v1), 2026-05-03 | F, task design/hardening: skipped verification, leakage, evaluator/parser exploits and environmental hardening | Workflow breadth and hardening are established. Measure selective maintenance cost and honest task success |
| Gabor, Lynch and Rosenfeld, [EvilGenie: A Reward Hacking Benchmark](https://arxiv.org/abs/2511.21654v2), 2025/2026 | A refreshed: editable programming environment; compares holdouts, LLM judges and test-edit detection with human review | More editable-test examples alone do not establish a paper contribution |
| Zhao et al., [SpecBench: Measuring Reward Hacking in Long-Horizon Coding Agents](https://arxiv.org/abs/2605.21384v2), 2026-05-20 / revised Sep 9 | A: visible versus held-out behavior on systems-programming tasks | Score gaps do not identify unauthorized verifier manipulation; separate correctness and attempt labels |

## SWE-bench, contamination and concrete exploits

| Verified primary source | What it supports | Boundary for this project |
| --- | --- | --- |
| Jimenez et al., [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770v3), 2023/2024 | A: repository issue resolution with executable evaluation | Defines a capability setting, not a defense or cheating label |
| Liang, Garg and Moghaddam, [The SWE-Bench Illusion: When State-of-the-Art LLMs Remember Instead of Reason](https://arxiv.org/abs/2506.12286v4), 2025 | A: diagnostic path/function reproduction evidence suggesting memorization/contamination | Contamination is an evaluation-validity problem; these diagnostics do not prove deliberate cheating by an individual agent |
| Zheng et al., [SWE-Bench Pro Verified: A Reliable Benchmark for Software Engineering Agents](https://arxiv.org/html/2609.08149v3), 2026-09-08 / revised Oct 9 | F, leakage/hardening sections: filesystem, future-history, network and metadata channels, plus task/test quality | Hiding answers and cleaning Git history are already studied. A final diff cannot observe reads or memorized answers |
| ConnorBAdams, [Git Reward Hacking in SWEBench Pro OSS, issue #93](https://github.com/scaleapi/SWE-bench_Pro-os/issues/93), 2026-04-29 | R: future commits/branches/tags can expose solution patches | A vulnerability report is not a natural-agent exploit prevalence estimate; ordinary historical context differs from an answer oracle |
| Von Arx, Chan and Barnes, [Recent Frontier Models Are Reward Hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/), 2025-06-05 | R: scorer monkey-patching, stack-based answer retrieval, timing manipulation, cached references and equality tricks | Motivates wider taxonomy; does not supply current proctor results or permission to redistribute traces |

## What remains unestablished

The strongest incremental bet is a **policy-conditioned evaluation of verification
maintenance**, followed by a selective-protection system only if it beats simpler
locking while preserving useful work. Three evidence tiers (diff, permission,
external trace) expose an observable limitation of current Proctor rather than
assuming it receives context it does not have.

No external artifact was executed and no published percentage was reproduced.
No cross-benchmark leaderboard is valid: attempts, successful hacks, score gaps,
alerts and prevention have different denominators. Before a submission, refresh
this search, inspect comparison code/licenses and newer versions, and collect
independent data. The public assistant-authored seed is contaminated development
material, not evidence of novelty, generalization or causal prevention. The
existing [evaluation protocol](evaluation-plan.md) also discusses ImpossibleBench,
HVTB and other stress-test sources reviewed in PR #46; those are optional external
collection candidates, not imported data or mandatory prerequisites for this lean
pilot.
