# proctor

## What This Is

`proctor` is a developer-facing CLI guard that catches AI coding agents gaming their own test suites — deleting tests, skipping them, weakening assertions, or hardcoding outputs to fake a green build. It ships as three layers: a skill (markdown ruleset for agents), a deterministic diff analyzer (git hook + Claude Code hook + standalone CLI), and a reproducible benchmark that measures cheat rate with and without proctor. No infra, one command, MIT, runs locally.

## Core Value

Catch the agent deleting your test before the commit lands — with a diff-level guard the agent's own reasoning can't bypass.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Prior art check: verify "proctor" name (npm + GitHub) and wedge uniqueness before writing code
- [ ] Detect RH001: test file/function deleted or renamed in a change meant to fix code
- [ ] Detect RH002: assertion removed or weakened (toBe(x)→toBeDefined(), tolerance widened)
- [ ] Detect RH003: test skipped/disabled (.skip, xit, @pytest.mark.skip, commented-out test)
- [ ] Detect RH007: test excluded from run path via config change alongside a fix
- [ ] `proctor check` CLI with pretty output and exit codes (0/1/2)
- [ ] `--staged` and `--ci` flags
- [ ] `proctor install-hook` git pre-commit installer
- [ ] L1 SKILL.md: honest-completion ruleset (never modify/skip/delete tests to pass)
- [ ] Skill adapters for ≥4 agents from one source + drift-check script
- [ ] Claude Code Stop hook: blocks agent turn on high-severity finding
- [ ] `--json` and `--sarif` output for CI/PR annotations
- [ ] RH004: hardcoded/special-cased implementation matching test literal (heuristic + optional --ai)
- [ ] RH005: unit under test gutted (body→constant) while test asserts richer behavior
- [ ] RH006: snapshot/golden file rewritten without stated reason
- [ ] RH008: tautological new test (asserts value computed by code under test)
- [ ] `--ai` flag: optional LLM judge for ambiguous signatures (injected interface, offline mode unaffected)
- [ ] `proctor bench`: held-out-test harness, N tasks, measures cheat rate with/without proctor
- [ ] Benchmark publishes raw CSV + methodology (cite EvilGenie)
- [ ] README with before/after cheat-rate table + memeable hook line
- [ ] Demo GIF
- [ ] `npm publish` + GitHub Action (`action.yml`)
- [ ] Go + Java language support

### Out of Scope

- Test runner functionality — proctor sits on top of Jest/Vitest/pytest/go test, never replaces them
- General security scanning — focused solely on test-tampering detection
- Test quality analysis (is this a good test?) — v1 only asks "did the agent tamper with it?"
- Mutation testing — that's a separate concern (Stryker et al.)

## Context

Solo build. Name confirmed: package `@kavishdua/proctor` (scoped to avoid dead `proctor` v0.0.4 on npm); binary/CLI brand `proctor`. Prior art sweep complete — see ### Prior Art below.

Key research anchors:
- **EvilGenie benchmark** (reward-hacking): Sonnet 4 hardcoded 2.1%, gave fake heuristic solutions 20.7%; Gemini CLI deleted test files 3.4%
- **Baker et al. 2025**: o3-mini learned to modify test cases during training
- **Claude Sonnet 4**: exploited SWE-bench data leaks
- **Sakana AI CUDA agent**: exploited eval code for fake 100× speedup
- **METR**: vendors mitigate internally with classifiers, but nothing exists in-repo for normal devs

Differentiation moat: the **deterministic diff-level guard** (L2) + **reproducible benchmark** (L3). A prompt alone can't replicate these. The skill (L1) is table stakes; L2+L3 are the product.

Architecture:
```
git diff ──► parse ──► signature checks (RH001…008) ──► findings ──► report / block
                │              │                             │
          hunk + AST      pure fns over diff          pretty | json | sarif
          (tree-sitter)   + repoContext + (opt) AI judge      + exit code / hook block
```

### Prior Art

No direct competitor found. Search terms 'reward hacking guard', 'agent test tampering', 'prevent AI delete tests', 'test cheating detector', and 'diff-level test guard' returned no matching npm packages or GitHub tools as of 2026-07-01.

**Adjacent tool landscape:**

| Tool | Detection Method | Scope | Runs in git hook | Zero network | License |
|------|-----------------|-------|-----------------|-------------|---------|
| **proctor** | Deterministic diff-level (pure functions over git diff) | Test tampering only | Yes | Yes | MIT |
| loki-mode | LLM judge (inferred) | Full SDLC (11 gates bundled) | No | No | BUSL-1.1 |
| Stryker / Pitest | Code mutation + test runner | Test suite quality (inverse concern) | No | Yes | Apache / MIT |
| EvilGenie | Held-out tests + LLM judge + file edit detection | Research benchmark (not a guard) | No | No | Research only |
| METR / vendor classifiers | Proprietary (model internals) | Internal model training mitigations | No | No | Proprietary |

D-06 assessment: no tool found with deterministic diff-level detection as a standalone developer guard — proctor's moat is uncontested.

**Academic evidence the problem is real:**

- EvilGenie (arxiv:2511.21654): Claude Sonnet 4 hardcoded 2.1% (unambiguous) / 33.3% (ambiguous); Gemini 2.5 Pro modified tests 0.7%; Codex hardcoded 44.4% (ambiguous)
- Baker et al. 2025 (Anthropic): o3-mini learned to modify test cases during training
- METR: vendors mitigate internally with proprietary classifiers operating on model internals — nothing exists in-repo for normal developers

### Differentiation

Every adjacent tool solves a different problem. Stryker mutates your implementation to measure whether your tests are strong; proctor detects when an AI agent mutated your tests to hide that the implementation is broken — the inverse concern. EvilGenie proves the cheating happens (Claude Sonnet 4: 2.1% hardcoded on unambiguous tasks, 33.3% on ambiguous; Gemini 2.5 Pro: 0.7% deleted test files) but is a research benchmark for AI labs, not a drop-in guard for developers. loki-mode bundles a test-mutation gate inside a full autonomous SDLC framework that requires adopting loki's entire workflow; it cannot run as a standalone git hook in an existing repo. METR and vendors mitigate internally with proprietary classifiers operating on model internals — inaccessible to the normal developer. Proctor fills the gap: a deterministic, diff-level guard that runs in a git pre-commit hook or Claude Code Stop hook, requires zero LLM, zero network, and zero changes to the agent's prompt. Because it operates at the diff layer — below the agent's own reasoning chain — the agent cannot reason its way around it.

*(This paragraph is the canonical wedge statement — pull verbatim or close paraphrase into Phase 7 README.)*

## Constraints

- **Tech Stack**: TypeScript, Node 20+, ESM — distributes via npx, git hook, GitHub Action
- **Dependencies**: Minimal. tree-sitter (or light AST) for assertion/skip detection in JS/TS + Python. No network required for core.
- **Determinism**: Deterministic core must require zero network. `--ai` is purely additive.
- **MVP Languages**: JS/TS + Python first; Go + Java later (P5)
- **Performance**: Must be fast enough for CI and git hooks — linters that are slow don't get adopted
- **License**: MIT

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + Node 20 ESM | Dominant in target ecosystem (JS/TS repos), npx distribution, no install friction | — Pending |
| tree-sitter for AST | Light, multi-language, already used in similar tools; avoids full parser per language | — Pending |
| Deterministic core, AI opt-in | CI/hook adoption requires zero-network, fast, predictable; --ai mode for ambiguous cases only | — Pending |
| Separate L1/L2/L3 layers | Skill alone is copyable (7-word prompt risk); guard + benchmark are the moat | — Pending |
| Pure functions over diff + injected repoContext | Keeps signature checks testable in isolation; hooks and AI judge are injected interfaces | — Pending |
| fixtures/ repo with one planted cheat per RH-ID | Doubles as verification target (GSD) and benchmark seed | — Pending |
| npm package name | Unscoped `proctor` taken by abandoned JS watcher (gratimax, v0.0.4, ~2014); npm dispute policy frozen since 2021; `@kavishdua/proctor` returns HTTP 404 (unclaimed). Scoped packages default to private — Phase 7 must publish with `npm publish --access public`. | Package `@kavishdua/proctor`; binary/CLI brand `proctor` (`bin` field). Per D-01, D-02, D-03. |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-01 after initialization*
