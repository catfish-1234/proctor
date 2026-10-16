# Verified related work and data sources

Checked 2026-10-16, America/Los_Angeles. Targeted primary-source review, not a
systematic survey or reproduction. F = relevant full text inspected; A = abstract/
metadata only; C = original card/code inspected; R = original report. Sources were
opened; no external implementation or dataset was executed. Source-reported
quantities are not Proctor measurements. Absence in inspected sections is not
proof of novelty. Refresh before preregistration and submission.

## Closest comparisons

| Primary source / depth | Established overlap | Distinction that this paper must earn |
| --- | --- | --- |
| Zheng et al., [BenchShield](https://arxiv.org/html/2609.11028v1), F sections 1-6 | Reward lifecycle/authority model, phase-aware taint, infrastructure evidence and semantic audit, missing-evidence verdicts. | Authorized verifier evolution with measured maintenance and review cost. Infrastructure provenance or a trusted boundary alone is insufficient. No original runnable release verified in inspected source. |
| Dai and Wang, [AgentGuard: Learning Execution Guardrails from Anomalous Coding-Agent Trajectories](https://arxiv.org/html/2609.16287v1), F method/experiments | Conditional guardrail instructions, explicit legitimate-test-change exceptions and useful completion; instructions do not intercept actions. | Compare guidance directly. Neither a coding-agent skill nor permission-aware exceptions are new. No original runnable artifact verified; a paper-based reconstruction must be labeled. |
| Koohestani, [AgentGuard: Runtime Verification of AI Agents](https://arxiv.org/html/2509.23864v1), F background/method | Runtime I/O abstraction, online MDP learning and probabilistic checking. | Different same-name work; not Dai/Wang's skill or a drop-in diff comparator. |
| Atinafu and Cohen, [RewardHackingAgents](https://arxiv.org/html/2603.11337v1), F method/experiments; [original code](https://github.com/Yonas650/RewardHackingAgents), C README/license | Evaluator locking, data-access restrictions and pristine external scoring. | Mandatory locking/recomputation baselines. MIT code inspected but not run; process instrumentation is not an OS boundary. |
| Deshpande et al., [contrastive detection / TRACE](https://arxiv.org/html/2601.20103v1), F method; [original data card](https://huggingface.co/datasets/PatronusAI/trace-dataset), C | Synthetic, human-verified simulated-tool trajectories, benign contrasts and LLM detection. | Executed repository maintenance with authenticated policy is a different source. Taxonomy/contrastive labels are prior art. Data is gated on contact sharing, CC BY-SA 4.0; no access presumed. |
| Shao et al., [HackDetect / protocol validity](https://arxiv.org/html/2607.22368v1), F method | Separates exposure, use and score attribution; paired reruns and ablations. | Framing 3 is supporting measurement, not novelty from a score gap. |
| Qin et al., [LLM Agents Can Easily Tamper With Their Own Traces](https://arxiv.org/html/2609.30266v1), F introduction/method | Local trace deletion/fabrication and skill-induced trace tampering. | Host-controlled logging is a prerequisite; native transcript completeness cannot be assumed. |
| Gaonkar, [TRACE: Diagnosing Verifier Brittleness in Agentic Evaluation](https://arxiv.org/abs/2610.11678v1), A | Second same-name TRACE; targeted evaluation changes, paired runs and rescoring fixed trajectories. | Further collision for framing 3. No full-text/code comparison established here. |
| Wang et al., [BenchJack](https://arxiv.org/html/2605.12673v1), F introduction | Benchmark exploit taxonomy, automated red-teaming, iterative hardening. | No first general benchmark audit/tamper taxonomy claim; attack discovery is not natural prevalence. |

Foundations already cover reward tampering and proxy divergence: Everitt et al.,
[Reward Tampering Problems and Solutions in RL](https://arxiv.org/abs/1908.04734v5)
(A), and Skalse et al., [Defining and Characterizing Reward Hacking](https://arxiv.org/abs/2209.13085v2)
(A). Editable-code and visible/held-out comparisons also appear in
[EvilGenie](https://arxiv.org/abs/2511.21654v2) and
[SpecBench](https://arxiv.org/abs/2605.21384v2) (A). Those endpoints differ from
accepted unauthorized evidence. Do not copy their percentages into our evidence.

## Independent data: exact source and access checks

| Source / depth | Verified acquisition reference | Research use and limits |
| --- | --- | --- |
| [Nebius SWE-agent trajectories](https://huggingface.co/datasets/nebius/SWE-agent-trajectories), C card/schema | Revision [`68195a1450865274106246d0d0296a1d6807b88e`](https://huggingface.co/datasets/nebius/SWE-agent-trajectories/commit/68195a1450865274106246d0d0296a1d6807b88e). Source reports 80,036 executed trajectories, about 1.11 GB download / 5.63 GB uncompressed. | Real executed agents, not simulated conversations. Includes patches/eval logs; no authenticated permissions/full host events. CC BY 4.0 plus repository licenses and card's Llama output notice. `target` is issue resolution, not an integrity label. |
| [SWE-bench Verified official guide](https://www.swebench.com/SWE-bench/guides/datasets/), C; [HF metadata](https://huggingface.co/api/datasets/SWE-bench/SWE-bench_Verified), C | `SWE-bench/SWE-bench_Verified`, revision `78f471bf655a3137b2e8a75af1501690ec009ec3`, ungated; source-reported 500 test tasks. | Ordinary issue-resolution stratum. Public gold patch/tests and model contamination limit secrecy claims; exclude answers from agent mounts. Harness MIT does not override repository/data rights. |
| [Official SWE-bench experiments](https://github.com/SWE-bench/experiments), C README/[download code](https://raw.githubusercontent.com/SWE-bench/experiments/main/analysis/download_logs.py) | [Released SWE-agent run metadata](https://raw.githubusercontent.com/SWE-bench/experiments/main/evaluation/lite/20240402_sweagent_gpt4/metadata.yaml) points to `s3://swe-bench-submissions/lite/20240402_sweagent_gpt4/trajs` and `/logs`. | Released trajectories and availability preflight command verified; objects not downloaded. Pin repository commit and downloaded hashes; audit rights and task overlap. Later submissions may use separate `assets.repo`. |
| [SWE-bench paper](https://arxiv.org/abs/2310.06770v3), A | Real GitHub issue resolution with executable evaluation. | Capability benchmark, not tampering ground truth. |
| [SWE-Bench Pro Verified](https://arxiv.org/html/2609.08149v3), F leakage/task-quality sections | Filesystem, history, network and metadata leakage plus oracle quality. | Hiding answers/cleaning history are established controls. |
| [METR frontier reward-hacking report](https://metr.org/blog/2025-06-05-recent-reward-hacking/), R | Concrete scorer, cached-reference and answer-access failures. | Motivates attacks; supplies neither Proctor results nor automatic trace redistribution rights. |

The Nebius YAML schema's `trajectory` is a list of message structs, although card
prose calls it a string; preserve raw rows and parse JSON only if it is a string.
Other useful fields are `instance_id`, `model_name`, `exit_status`,
`generated_patch`, `eval_logs`, `target`. Retrospective records with unknown
permissions can assess observability; they cannot be silently assigned benign.

The incremental bet is narrow: explicit, separately authorized verifier migrations
may reduce review cost while retaining integrity and useful completion against
*locking with the same exceptions*, evaluated on independent maintenance and
adaptive tasks. No published effect is reproduced here. Release availability,
licenses and comparison implementations need another audit before execution.
